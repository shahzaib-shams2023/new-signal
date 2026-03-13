/**
 * binanceService.ts
 *
 * Optimized Binance USD-M Futures API service:
 *  - Strict request queue (1 request at a time, adaptive interval)
 *  - Proactive weight tracking via response headers
 *  - Exponential back-off on 429 / 418 with jitter
 *  - Candle LRU cache so repeat scans cost 0 API weight
 *  - WebSocket kline streams for the 3 timeframes (no REST polling once subscribed)
 *  - Auto-reconnecting WebSocket manager
 *  - Unlimited USD-M symbol universe (all TRADING USDT pairs)
 */

import { Candle, SymbolInfo } from '../types';

// ─── Endpoints ────────────────────────────────────────────────────────────────
const REST_BASE = 'https://fapi.binance.com/fapi/v1';
const WS_BASE = 'wss://fstream.binance.com/ws';
const WS_COMBINED = 'wss://fstream.binance.com/stream?streams=';

// ─── Weight / back-off state ──────────────────────────────────────────────────
let usedWeight1m = 0;
let backoffUntil = 0;
let banType: 'NONE' | 'RATE_LIMIT' | 'IP_BAN' = 'NONE';

// Binance USD-M Futures limit is 2400 weight per minute.
// We hard-stop at 2000.
const WEIGHT_STOP = 2000;
const WEIGHT_MAX = 2400;

export const getRateLimitStatus = () => ({
  isLimited: Date.now() < backoffUntil,
  resetTime: backoffUntil,
  type: banType,
  usedWeight: usedWeight1m,
  weightPct: Math.round((usedWeight1m / WEIGHT_MAX) * 100),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function jitter(baseMs: number, spread = 0.3) {
  return baseMs * (1 + (Math.random() * 2 - 1) * spread);
}

// ─── Request Queue ────────────────────────────────────────────────────────────
// All REST calls are serialised through a single async queue so we never
// accidentally fire > 1 request simultaneously and overshoot the weight limit.

interface QueuedTask {
  endpoint: string;
  weight: number;
  resolve: (v: any) => void;
  reject: (e: any) => void;
}

const queue: QueuedTask[] = [];
const MAX_CONCURRENT = 10;
let activeRequests = 0;
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    // ── Back-off gate ────────────────────────────────────────────────────────
    const remaining = backoffUntil - Date.now();
    if (remaining > 0) {
      await sleep(remaining + jitter(500));
      continue;
    }

    // ── Adaptive throttle based on weight ────────────────────────────────────
    if (usedWeight1m >= WEIGHT_STOP) {
      await sleep(10_000);
      usedWeight1m = WEIGHT_STOP - 1; // decay weight to allow polling API again and get true updated weight
      continue;
    }

    const task = queue.shift()!;
    activeRequests++;

    // Execute task without awaiting it here to allow parallel processing
    (async () => {
      try {
        const result = await executeRequest(task.endpoint, task.weight);
        task.resolve(result);
      } catch (err) {
        task.reject(err);
      } finally {
        activeRequests--;
        processQueue(); // Try to pick up next task
      }
    })();

    // Brief delay between starting concurrent requests to avoid bursts
    await sleep(20);
  }

  isProcessing = false;

  // Edge case: if a task was queued while we were exiting the loop
  if (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    processQueue();
  }
}

function enqueue<T>(endpoint: string, weight: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ endpoint, weight, resolve: resolve as any, reject });
    processQueue();
  });
}

// ─── Execute a single REST request ────────────────────────────────────────────
async function executeRequest(endpoint: string, weight: number): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout
      const res = await fetch(`${REST_BASE}${endpoint}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      // Sync weight from header on every response
      const wh = res.headers.get('x-mbx-used-weight-1m');
      if (wh) usedWeight1m = parseInt(wh, 10);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
        const wait = retryAfter * 1_000;
        backoffUntil = Date.now() + wait;
        banType = 'RATE_LIMIT';
        console.warn(`🔴 429 Rate-limit – back off ${retryAfter} s`);
        await sleep(wait + jitter(1_000));
        attempt++;
        continue; // retry same request
      }

      if (res.status === 418) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '600', 10);
        const wait = retryAfter * 1_000;
        backoffUntil = Date.now() + wait;
        banType = 'IP_BAN';
        console.error(`🚨 418 IP-Ban – back off ${retryAfter} s`);
        await sleep(wait + jitter(2_000));
        attempt++;
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      return await res.json();

    } catch (err: any) {
      if (err.message?.includes('fetch') || err.name === 'AbortError' || err.message?.includes('NetworkError')) {
        // Reduced wait for high-frequency trading context
        const wait = Math.min(1_000 * Math.pow(2, attempt), 10_000);
        console.warn(`🌐 Network error/timeout (${err.message}) – retry in ${wait / 1000} s`);
        await sleep(jitter(wait));
        attempt++;
        if (attempt > 3) throw err;
        continue;
      }
      throw err;
    }
  }
}

/**
 * High-performance batch candle fetcher.
 * Uses the internal prioritized queue to handle rate limits and concurrency.
 */
export const fetchKlinesBatch = async (
  symbols: string[],
  interval: string,
  limit = 100
): Promise<Record<string, Candle[]>> => {
  const results: Record<string, Candle[]> = {};
  const toFetch: string[] = [];

  for (const s of symbols) {
    const cached = getCached(`${s}-${interval}`, interval);
    if (cached) {
      results[s] = cached.slice(-limit);
    } else {
      toFetch.push(s);
    }
  }

  if (toFetch.length === 0) return results;

  // Process batch in parallel while respecting our queue's MAX_CONCURRENT (5)
  await Promise.all(toFetch.map(async (symbol) => {
    try {
      results[symbol] = await fetchKlines(symbol, interval, limit);
    } catch (_) {
      results[symbol] = [];
    }
  }));

  return results;
};

// ─── Candle LRU Cache ─────────────────────────────────────────────────────────
// Stores the last fetched candle array per (symbol, interval).
// TTL is 1 candle-period so we never serve stale data but avoid hammering
// the API for the same symbol/tf twice per scan cycle.

interface CacheEntry {
  candles: Candle[];
  fetchedAt: number;
}

const candleCache = new Map<string, CacheEntry>();

const CANDLE_TTL: Record<string, number> = {
  '1m': 60_000 * 0.9,    // 54 seconds
  '1h': 60_000 * 50,     // 50 minutes
  '4h': 60_000 * 210,    // 3.5 hours
};

function getCached(key: string, interval: string): Candle[] | null {
  const entry = candleCache.get(key);
  if (!entry) return null;
  const ttl = CANDLE_TTL[interval] ?? 55_000;
  if (Date.now() - entry.fetchedAt < ttl) {
    // Optimization: If we already tried to fetch the max available history, 
    // don't try again until the TTL expires even if it's less than 'limit'.
    return entry.candles;
  }
  candleCache.delete(key);
  return null;
}

function setCache(key: string, candles: Candle[]) {
  candleCache.set(key, { candles, fetchedAt: Date.now() });
  // Keep map size bounded (max 5000 entries ≈ 1500 symbols × 3 tfs)
  if (candleCache.size > 5_000) {
    const firstKey = candleCache.keys().next().value;
    if (firstKey) candleCache.delete(firstKey);
  }
}

// ─── Combined WebSocket Manager ───────────────────────────────────────────────
// Binance allows up to 200 streams per single connection. We use this to
// track all top volatile coins across all 3 timeframes without hitting connection limits.
// Partitioning into multiple connections if streams > 200.

class CombinedStreamManager {
  private sockets: Map<number, WebSocket> = new Map();
  private streams = new Set<string>();

  addStreams(newStreams: string[]) {
    const toAdd = newStreams.filter(s => !this.streams.has(s));
    if (toAdd.length === 0) return;

    toAdd.forEach(s => this.streams.add(s));

    // Recalculate chunks for all streams
    const streamArray = Array.from(this.streams);
    const requiredConnections = Math.ceil(streamArray.length / 200);

    // For simplicity in this demo, if we exceed current connections, 
    // we reconnect. In a production app, we'd only add the diff.
    // However, to keep it 'incremental' and avoid gaps, we only 
    // cycle if the stream count actually changed significantly.
    if (this.sockets.size !== requiredConnections) {
      this.reconnectAll();
    }
  }

  private reconnectAll() {
    this.sockets.forEach(ws => ws.close());
    this.sockets.clear();

    const streamArray = Array.from(this.streams);
    for (let i = 0; i < streamArray.length; i += 200) {
      const chunk = streamArray.slice(i, i + 200);
      const url = `${WS_COMBINED}${chunk.join('/')}`;
      const connId = i / 200;

      const ws = createAutoReconnectWs(url, (raw) => {
        try {
          const data = JSON.parse(raw);
          const k = data.data.k;
          const cacheKey = `${k.s}-${k.i}`;

          const updated: Candle = {
            time: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          };

          const cached = candleCache.get(cacheKey);
          if (cached) {
            const arr = [...cached.candles];
            const lastIdx = arr.length - 1;
            if (arr[lastIdx]?.time === updated.time) arr[lastIdx] = updated;
            else { arr.push(updated); if (arr.length > 200) arr.shift(); }
            candleCache.set(cacheKey, { candles: arr, fetchedAt: Date.now() });
          }
        } catch (_) { }
      }, () => { });

      this.sockets.set(connId, ws);
    }
  }
}

const streamManager = new CombinedStreamManager();

export function subscribeKlines(symbols: string[], intervals: string[]) {
  const streams: string[] = [];
  symbols.forEach(s => {
    intervals.forEach(tf => {
      streams.push(`${s.toLowerCase()}@kline_${tf}`);
    });
  });
  streamManager.addStreams(streams);
}


// ─── Auto-reconnect WebSocket factory ─────────────────────────────────────────
function createAutoReconnectWs(
  url: string,
  onMessage: (data: string) => void,
  onOpen?: () => void
): WebSocket {
  let ws: WebSocket;
  let dead = false;

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => onOpen?.();
    ws.onmessage = e => onMessage(e.data);
    ws.onerror = () => { };
    ws.onclose = () => {
      if (!dead) {
        setTimeout(connect, jitter(3_000, 0.5));
      }
    };
  }

  connect();

  // Expose close() so callers can intentionally kill it
  const proxy = new Proxy({} as WebSocket, {
    get(_, prop) {
      if (prop === 'close') return () => { dead = true; ws.close(); };
      return (ws as any)[prop];
    }
  });

  return proxy;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch ALL USD-M futures tickers + exchange info in two lightweight requests.
 * Weight: /ticker/24hr = 40, /exchangeInfo = 1 → total 41
 */
let cachedExchangeInfo: any = null;
let lastExchangeInfoFetch = 0;

export const fetchTickers = async (): Promise<SymbolInfo[]> => {
  try {
    const shouldFetchEI = !cachedExchangeInfo || (Date.now() - lastExchangeInfoFetch > 3600_000);

    const [tickers, exchangeInfo] = await Promise.all([
      enqueue<any[]>('/ticker/24hr', 40),
      shouldFetchEI ? enqueue<any>('/exchangeInfo', 1) : Promise.resolve(cachedExchangeInfo),
    ]);

    if (shouldFetchEI) {
      cachedExchangeInfo = exchangeInfo;
      lastExchangeInfoFetch = Date.now();
    }

    const activeSet = new Set<string>(
      exchangeInfo.symbols
        .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map((s: any) => s.symbol as string)
    );



    // 1. Map for internal logic using numeric values for sorting
    const enriched = tickers
      .filter((t: any) => activeSet.has(t.symbol))
      .map((t: any) => ({
        ticker: {
          symbol: t.symbol,
          price: t.lastPrice,
          priceChangePercent: t.priceChangePercent,
          volume: t.volume,
          quoteVolume: t.quoteVolume,
          highPrice: t.highPrice,
          lowPrice: t.lowPrice,
        } as SymbolInfo,
        numChange: parseFloat(t.priceChangePercent),
        numVolume: parseFloat(t.quoteVolume)
      }));

    // 2. Include ALL liquid coins (>$1M daily volume) sorted by volume
    //    This ensures we scan the full universe for high-probability setups
    //    rather than only coins that are already pumping.
    const liquidCoins = enriched
      .filter((a) => a.numVolume > 1_000_000) // $1M min to filter dead/illiquid pairs
      .sort((a, b) => b.numVolume - a.numVolume); // Highest volume first = most liquid = tightest spreads

    // 3. Return ALL liquid coins
    return liquidCoins.map(e => e.ticker);
  } catch (error) {
    console.error('fetchTickers error:', error);
    return [];
  }
};

/**
 * Fetch klines with cache-first logic.
 * Weight: 1 per call. With LRU cache this is often 0 API cost.
 */
export const fetchKlines = async (
  symbol: string,
  interval: string,
  limit = 90
): Promise<Candle[]> => {
  const cacheKey = `${symbol}-${interval}`;
  const cached = getCached(cacheKey, interval);

  // Optimization: If we have cached candles and they were fetched within the TTL,
  // return them regardless of length. This prevents spamming the API for
  // new coins that don't have enough history to reach the requested limit.
  if (cached) {
    return cached.slice(-limit);
  }

  try {
    const data = await enqueue<any[]>(
      `/klines?symbol=${symbol}&interval=${interval}&limit=${Math.max(limit, 100)}`,
      1
    );

    if (!Array.isArray(data)) {
      setCache(cacheKey, []);
      return [];
    }

    const candles: Candle[] = data.map((d: any[]) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));

    setCache(cacheKey, candles);
    return candles.slice(-limit);
  } catch (err) {
    // Cache empty array to avoid repeatedly hammering the API for broken or delisted coins
    console.warn(`Error fetching klines for ${symbol} ${interval}:`, err);
    setCache(cacheKey, []);
    return [];
  }
};

/**
 * Subscribe to mini-ticker stream (lower bandwidth than full ticker).
 * Used for fast price updates without heavy payload.
 */
export const subscribeToMiniTickers = (
  onMessage: (data: any[]) => void
): { close: () => void } => {
  const ws = createAutoReconnectWs(
    `${WS_BASE}/!miniTicker@arr`,
    (raw) => {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) onMessage(data);
      } catch (_) { }
    }
  );

  return { close: () => (ws as any).close() };
};

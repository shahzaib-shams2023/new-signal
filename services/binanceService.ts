
import { Candle, SymbolInfo } from '../types';

const BASE_URL = 'https://fapi.binance.com/fapi/v1';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';

// --- Rate Limit & Queue Configuration ---
const MAX_WEIGHT_PER_MINUTE = 2400;
const SAFETY_THRESHOLD = 2000; // Start throttling at 2000
const CRITICAL_THRESHOLD = 2200; // Hard stop at 2200

interface RequestTask {
  endpoint: string;
  weight: number;
  resolve: (data: any) => void;
  reject: (error: any) => void;
  retries: number;
}

class RequestQueue {
  private queue: RequestTask[] = [];
  private processing = false;
  private currentWeight = 0;
  private lastWeightReset = Date.now();
  private backoffUntil = 0;
  private activeBan: 'NONE' | 'RATE_LIMIT' | 'IP_BAN' = 'NONE';

  constructor() {
    // Reset weight every minute
    setInterval(() => {
      this.currentWeight = 0;
      this.lastWeightReset = Date.now();
    }, 60000);
  }

  get status() {
    return {
      weight: this.currentWeight,
      isLimited: Date.now() < this.backoffUntil,
      resetIn: Math.max(0, this.backoffUntil - Date.now()),
      banType: this.activeBan,
      queueSize: this.queue.length
    };
  }

  async add(endpoint: string, weight: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ endpoint, weight, resolve, reject, retries: 0 });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (Date.now() < this.backoffUntil) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      // Check weight
      if (this.currentWeight + this.queue[0].weight > CRITICAL_THRESHOLD) {
        console.warn('Queue: Weight limit reached. Waiting...');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const task = this.queue.shift()!;
      try {
        const data = await this.execute(task);
        task.resolve(data);
      } catch (error: any) {
        if (task.retries < 3 && !error.message.includes('IP_BAN')) {
          task.retries++;
          console.warn(`Queue: Retrying ${task.endpoint} (${task.retries}/3)`);
          this.queue.push(task); // Re-queue
        } else {
          task.reject(error);
        }
      }

      // Small delay between requests to avoid burst
      await new Promise(r => setTimeout(r, 50));
    }

    this.processing = false;
  }

  private async execute(task: RequestTask): Promise<any> {
    const response = await fetch(`${BASE_URL}${task.endpoint}`);

    // Update weight from headers
    const weightHeader = response.headers.get('x-mbx-used-weight-1m');
    if (weightHeader) {
      this.currentWeight = parseInt(weightHeader);
    } else {
      this.currentWeight += task.weight;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      this.backoffUntil = Date.now() + waitTime;
      this.activeBan = 'RATE_LIMIT';
      throw new Error(`RATE_LIMIT: Paused for ${waitTime / 1000}s`);
    }

    if (response.status === 418) {
      this.backoffUntil = Date.now() + 600000; // 10 mins
      this.activeBan = 'IP_BAN';
      throw new Error('IP_BAN: Paused for 10 minutes');
    }

    if (!response.ok) {
      throw new Error(`Binance Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}

const queue = new RequestQueue();

// --- Caching ---
const klineCache: Map<string, { data: Candle[], timestamp: number }> = new Map();
const CACHE_TTL = 30000; // 30 seconds

// --- API Methods ---

export const getRateLimitStatus = () => queue.status;

export const fetchTickers = async (): Promise<SymbolInfo[]> => {
  try {
    const tickers = await queue.add('/ticker/24hr', 40);
    const exchangeInfo = await queue.add('/exchangeInfo', 1);

    const activeSymbolsMap = new Map<string, any>(
      exchangeInfo.symbols
        .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map((s: any) => [s.symbol, s])
    );

    return tickers
      .filter((t: any) => activeSymbolsMap.has(t.symbol))
      .map((t: any) => ({
        ...t,
        onboardDate: activeSymbolsMap.get(t.symbol)?.onboardDate
      }))
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
  } catch (error) {
    console.error('fetchTickers error:', error);
    return [];
  }
};

export const fetchKlines = async (symbol: string, interval: string, limit: number = 100): Promise<Candle[]> => {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  const cached = klineCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const data = await queue.add(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, 1);
    const candles = data.map((d: any[]) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5])
    }));

    klineCache.set(cacheKey, { data: candles, timestamp: Date.now() });
    return candles;
  } catch (error) {
    if (cached) return cached.data; // Return stale data on error
    throw error;
  }
};

export const subscribeToAllTickers = (onMessage: (data: any[]) => void): any => {
  // Use global WebSocket (Browser or Node 22+) or fallback to 'ws' if defined
  const WS = typeof WebSocket !== 'undefined' ? WebSocket : (global as any).WebSocket;

  if (!WS) {
    throw new Error('WebSocket is not defined. Please run with Node 22+ or install ws and polyfill global.WebSocket');
  }

  const ws = new WS(`${WS_BASE_URL}/!ticker@arr`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch (e) {
      console.error('WS Error', e);
    }
  };
  ws.onerror = () => console.warn('Binance WS Error (Auto-reconnecting...)');
  return ws;
};

export const fetchFundingRate = async (symbol: string): Promise<{ rate: string; nextFunding: number }> => {
  try {
    const data = await queue.add(`/premiumIndex?symbol=${symbol}`, 1);
    return {
      rate: (parseFloat(data.lastFundingRate) * 100).toFixed(4) + '%',
      nextFunding: data.nextFundingTime
    };
  } catch {
    return { rate: '0.0000%', nextFunding: Date.now() };
  }
};

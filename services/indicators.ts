import { Candle, StrategyMatch } from '../types';

// ─── EMA ────────────────────────────────────────────────────────────────────────
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(0);
  if (data.length === 0) return ema;

  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
    ema[i] = sum / (i + 1);
  }

  for (let i = period; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// ─── RSI ────────────────────────────────────────────────────────────────────────
function calculateRSI(closes: number[], period: number): number[] {
  const rsi = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed with SMA of first `period` changes
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Smoothed (Wilder) for the rest
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// ─── MACD Histogram ─────────────────────────────────────────────────────────────
function calculateMACDHistogram(closes: number[]): number[] {
  const fastEMA = calculateEMA(closes, 12);
  const slowEMA = calculateEMA(closes, 26);

  const macdLine = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    macdLine[i] = fastEMA[i] - slowEMA[i];
  }

  const signalLine = calculateEMA(macdLine, 9);

  const histogram = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    histogram[i] = macdLine[i] - signalLine[i];
  }
  return histogram;
}

// ─── VWAP ───────────────────────────────────────────────────────────────────────
function calculateVWAP(candles: Candle[]): number[] {
  const vwap = new Array(candles.length).fill(0);
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += tp * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    vwap[i] = cumulativeVolume === 0 ? tp : cumulativeTPV / cumulativeVolume;
  }
  return vwap;
}

// ─── Volume SMA ─────────────────────────────────────────────────────────────────
function volumeSMA(candles: Candle[], period: number, idx: number): number {
  const start = Math.max(0, idx - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= idx; i++) {
    sum += candles[i].volume;
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: Multi-Confluence 1m Scalp Detector
// ═══════════════════════════════════════════════════════════════════════════════
export function detectImpulseSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1
): StrategyMatch | null {
  const bars = candles.length;
  // Need at least 55 bars for EMA 50 + a few bars of look-back
  if (bars < 55) return null;

  const idx = bars - 1 - offset; // Most recent CLOSED candle
  if (idx < 50) return null;

  const closes = candles.map(c => c.close);

  // ── Compute all indicators ──────────────────────────────────────────────────
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 7);
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1); // Avg of prior 20 candles

  // ── 1. EMA 9/21 Crossover (must happen on THIS candle) ──────────────────────
  const ema9CrossAbove = ema9[idx] > ema21[idx] && ema9[idx - 1] <= ema21[idx - 1];
  const ema9CrossBelow = ema9[idx] < ema21[idx] && ema9[idx - 1] >= ema21[idx - 1];

  // ── 2. Trend filter ─────────────────────────────────────────────────────────
  const aboveEma50 = price > ema50[idx];
  const belowEma50 = price < ema50[idx];

  // ── 3. VWAP bias ────────────────────────────────────────────────────────────
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  // ── 4. RSI zone ─────────────────────────────────────────────────────────────
  const rsiVal = rsi[idx];
  const rsiBullZone = rsiVal >= 40 && rsiVal <= 70;
  const rsiBearZone = rsiVal >= 30 && rsiVal <= 60;

  // ── 5. MACD histogram ──────────────────────────────────────────────────────
  const macdBull = macdHist[idx] > 0;
  const macdBear = macdHist[idx] < 0;

  // ── 6. Volume confirmation ─────────────────────────────────────────────────
  const volSpike = avgVol > 0 && vol >= 1.5 * avgVol;

  // ═══════════════════════════════════════════════════════════════════════════
  // LONG Signal: All 6 confluences must align
  // ═══════════════════════════════════════════════════════════════════════════
  if (ema9CrossAbove && aboveEma50 && aboveVwap && rsiBullZone && macdBull && volSpike) {
    // Stop Loss = lowest low of last 5 candles
    let swingLow = Infinity;
    for (let i = idx; i > idx - 5 && i >= 0; i--) {
      if (candles[i].low < swingLow) swingLow = candles[i].low;
    }
    const risk = price - swingLow;
    const tp = price + risk * 2; // 2:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BULLISH',
      signal: 'SCALP_LONG',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: swingLow,
      takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHORT Signal: All 6 confluences must align
  // ═══════════════════════════════════════════════════════════════════════════
  if (ema9CrossBelow && belowEma50 && belowVwap && rsiBearZone && macdBear && volSpike) {
    // Stop Loss = highest high of last 5 candles
    let swingHigh = -Infinity;
    for (let i = idx; i > idx - 5 && i >= 0; i--) {
      if (candles[i].high > swingHigh) swingHigh = candles[i].high;
    }
    const risk = swingHigh - price;
    const tp = price - risk * 2; // 2:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BEARISH',
      signal: 'SCALP_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: swingHigh,
      takeProfit: tp,
    };
  }

  return null;
}

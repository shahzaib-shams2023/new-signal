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
    if (risk <= 0) return null; // Guard: no valid risk distance
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
    if (risk <= 0) return null; // Guard: no valid risk distance
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

// ═══════════════════════════════════════════════════════════════════════════════
// MID-TF: Multi-Confluence Detector (5m / 15m / 30m)
// ═══════════════════════════════════════════════════════════════════════════════
export function detectMidSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1
): StrategyMatch | null {
  const bars = candles.length;
  // Need at least 55 bars for EMA 50 + look-back
  if (bars < 55) return null;

  const idx = bars - 1 - offset; // Most recent CLOSED candle
  if (idx < 50) return null;

  const closes = candles.map(c => c.close);

  // ── Compute all indicators ──────────────────────────────────────────────────
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 10);     // Slightly longer RSI for mid-TF
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);

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

  // ── 6. Volume confirmation (1.3× — between scalp 1.5× and swing 1.2×) ─────
  const volSpike = avgVol > 0 && vol >= 1.3 * avgVol;

  // ═══════════════════════════════════════════════════════════════════════════
  // MID LONG Signal
  // ═══════════════════════════════════════════════════════════════════════════
  if (ema9CrossAbove && aboveEma50 && aboveVwap && rsiBullZone && macdBull && volSpike) {
    // Stop Loss = lowest low of last 8 candles (wider lookback than scalp)
    let swingLow = Infinity;
    for (let i = idx; i > idx - 8 && i >= 0; i--) {
      if (candles[i].low < swingLow) swingLow = candles[i].low;
    }
    const risk = price - swingLow;
    if (risk <= 0) return null; // Guard: no valid risk distance
    const tp = price + risk * 2.5; // 2.5:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BULLISH',
      signal: 'MID_LONG',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: swingLow,
      takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MID SHORT Signal
  // ═══════════════════════════════════════════════════════════════════════════
  if (ema9CrossBelow && belowEma50 && belowVwap && rsiBearZone && macdBear && volSpike) {
    // Stop Loss = highest high of last 8 candles
    let swingHigh = -Infinity;
    for (let i = idx; i > idx - 8 && i >= 0; i--) {
      if (candles[i].high > swingHigh) swingHigh = candles[i].high;
    }
    const risk = swingHigh - price;
    if (risk <= 0) return null; // Guard: no valid risk distance
    const tp = price - risk * 2.5; // 2.5:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BEARISH',
      signal: 'MID_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: swingHigh,
      takeProfit: tp,
    };
  }

  return null;
}

// ─── ATR (Average True Range) ───────────────────────────────────────────────
function calculateATR(candles: Candle[], period: number): number[] {
  const atr = new Array(candles.length).fill(0);
  if (candles.length < 2) return atr;

  // True ranges
  const tr = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hpc, lpc);
  }

  // Wilder-smoothed ATR
  let sum = 0;
  for (let i = 0; i < period && i < tr.length; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWING: Multi-Confluence Swing Detector (1h / 4h)
// ═══════════════════════════════════════════════════════════════════════════════
export function detectSwingSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1
): StrategyMatch | null {
  const bars = candles.length;
  // Need at least 210 bars for EMA 200 + some look-back
  if (bars < 210) return null;

  const idx = bars - 1 - offset; // Most recent CLOSED candle
  if (idx < 200) return null;

  const closes = candles.map(c => c.close);

  // ── Compute indicators ────────────────────────────────────────────────────
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);
  const atr = calculateATR(candles, 14);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);

  // ── 1. EMA 20/50 Crossover (on THIS candle) ──────────────────────────────
  const emaCrossAbove = ema20[idx] > ema50[idx] && ema20[idx - 1] <= ema50[idx - 1];
  const emaCrossBelow = ema20[idx] < ema50[idx] && ema20[idx - 1] >= ema50[idx - 1];

  // ── 2. Macro trend (EMA 200) ──────────────────────────────────────────────
  const aboveEma200 = price > ema200[idx];
  const belowEma200 = price < ema200[idx];

  // ── 3. VWAP bias ──────────────────────────────────────────────────────────
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  // ── 4. RSI zone ───────────────────────────────────────────────────────────
  const rsiVal = rsi[idx];
  const rsiBullZone = rsiVal >= 45 && rsiVal <= 70;
  const rsiBearZone = rsiVal >= 30 && rsiVal <= 55;

  // ── 5. MACD histogram ─────────────────────────────────────────────────────
  const macdBull = macdHist[idx] > 0;
  const macdBear = macdHist[idx] < 0;

  // ── 6. Volume confirmation (1.2× for swing, lower bar than scalp) ─────────
  const volSpike = avgVol > 0 && vol >= 1.2 * avgVol;

  const currentATR = atr[idx];

  // ═══════════════════════════════════════════════════════════════════════════
  // SWING LONG
  // ═══════════════════════════════════════════════════════════════════════════
  if (emaCrossAbove && aboveEma200 && aboveVwap && rsiBullZone && macdBull && volSpike) {
    const sl = price - 1.5 * currentATR;
    const risk = price - sl;
    if (risk <= 0) return null; // Guard: no valid risk distance
    const tp = price + risk * 3; // 3:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BULLISH',
      signal: 'SWING_LONG',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: sl,
      takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWING SHORT
  // ═══════════════════════════════════════════════════════════════════════════
  if (emaCrossBelow && belowEma200 && belowVwap && rsiBearZone && macdBear && volSpike) {
    const sl = price + 1.5 * currentATR;
    const risk = sl - price;
    if (risk <= 0) return null; // Guard: no valid risk distance
    const tp = price - risk * 3; // 3:1 R:R

    return {
      symbol,
      price: candles[bars - 1].close,
      timeframe,
      type: 'BEARISH',
      signal: 'SWING_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price,
      stopLoss: sl,
      takeProfit: tp,
    };
  }

  return null;
}

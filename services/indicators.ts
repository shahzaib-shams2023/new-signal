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

  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

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

// ─── ATR (Average True Range) ───────────────────────────────────────────────────
function calculateATR(candles: Candle[], period: number): number[] {
  const atr = new Array(candles.length).fill(0);
  if (candles.length < 2) return atr;

  const tr = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hpc, lpc);
  }

  let sum = 0;
  for (let i = 0; i < period && i < tr.length; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ─── ADX (Average Directional Index) ────────────────────────────────────────────
function calculateADX(candles: Candle[], period: number): number[] {
  const len = candles.length;
  const adx = new Array(len).fill(0);
  if (len < period * 2 + 1) return adx;

  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  const tr = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;

    const hl = candles[i].high - candles[i].low;
    const hpc = Math.abs(candles[i].high - candles[i - 1].close);
    const lpc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hpc, lpc);
  }

  // Wilder-smooth +DM, -DM, TR — seed with first `period` bars
  let sPlusDM = 0, sMinusDM = 0, sTR = 0;
  for (let i = 1; i <= period; i++) {
    sPlusDM += plusDM[i];
    sMinusDM += minusDM[i];
    sTR += tr[i];
  }

  const dx = new Array(len).fill(0);
  for (let i = period; i < len; i++) {
    if (i > period) {
      sPlusDM = sPlusDM - (sPlusDM / period) + plusDM[i];
      sMinusDM = sMinusDM - (sMinusDM / period) + minusDM[i];
      sTR = sTR - (sTR / period) + tr[i];
    }
    const plusDI = sTR === 0 ? 0 : (sPlusDM / sTR) * 100;
    const minusDI = sTR === 0 ? 0 : (sMinusDM / sTR) * 100;
    const diSum = plusDI + minusDI;
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
  }

  // ADX = Wilder-smooth of DX
  const adxStart = 2 * period - 1;
  if (adxStart >= len) return adx;

  let dxSum = 0;
  for (let i = period; i <= adxStart; i++) dxSum += dx[i];
  adx[adxStart] = dxSum / period;

  for (let i = adxStart + 1; i < len; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }
  return adx;
}

// ─── Recent Crossover (within N candles, trend still valid) ─────────────────────
function recentCrossover(
  fast: number[], slow: number[], idx: number,
  window: number, direction: 'UP' | 'DOWN'
): boolean {
  // Trend must still be valid at idx
  if (direction === 'UP' && fast[idx] <= slow[idx]) return false;
  if (direction === 'DOWN' && fast[idx] >= slow[idx]) return false;

  // Check if crossover happened within the window
  for (let i = idx; i > idx - window && i > 0; i--) {
    if (direction === 'UP' && fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) return true;
    if (direction === 'DOWN' && fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) return true;
  }
  return false;
}

// ─── Candle Quality Check ───────────────────────────────────────────────────────
function isCandleQualified(candle: Candle, direction: 'BULL' | 'BEAR', minBodyRatio: number): boolean {
  const range = candle.high - candle.low;
  if (range === 0) return false;

  const body = Math.abs(candle.close - candle.open);
  if ((body / range) < minBodyRatio) return false;

  // Close should be in the favorable portion of the range
  if (direction === 'BULL') {
    return (candle.close - candle.low) / range >= 0.4; // Close in upper 60%
  } else {
    return (candle.high - candle.close) / range >= 0.4; // Close in lower 60%
  }
}

// ─── Find Nearest Swing High (Resistance) ───────────────────────────────────────
function findNearestResistance(candles: Candle[], idx: number, lookback: number): number | null {
  const price = candles[idx].close;
  let nearest = Infinity;
  const start = Math.max(1, idx - lookback);

  for (let i = start; i < idx - 1; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) {
      if (candles[i].high > price && candles[i].high < nearest) {
        nearest = candles[i].high;
      }
    }
  }
  return nearest === Infinity ? null : nearest;
}

// ─── Find Nearest Swing Low (Support) ───────────────────────────────────────────
function findNearestSupport(candles: Candle[], idx: number, lookback: number): number | null {
  const price = candles[idx].close;
  let nearest = -Infinity;
  const start = Math.max(1, idx - lookback);

  for (let i = start; i < idx - 1; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) {
      if (candles[i].low < price && candles[i].low > nearest) {
        nearest = candles[i].low;
      }
    }
  }
  return nearest === -Infinity ? null : nearest;
}

// ─── HTF Trend Bias (exported for multi-TF confirmation) ────────────────────────
export function computeTrendBias(candles: Candle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (candles.length < 55) return 'NEUTRAL';
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const last = candles.length - 1;
  const price = candles[last].close;

  if (ema20[last] > ema50[last] && price > ema20[last]) return 'BULLISH';
  if (ema20[last] < ema50[last] && price < ema20[last]) return 'BEARISH';
  return 'NEUTRAL';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCALP: Multi-Confluence 1m Detector
// - Widened crossover window (3 candles)
// - ADX trending filter
// - Candle body quality check
// - HTF alignment
// - Dynamic TP from S/R levels
// ═══════════════════════════════════════════════════════════════════════════════
export function detectImpulseSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1,
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 55) return null;

  const idx = bars - 1 - offset;
  if (idx < 50) return null;

  const closes = candles.map(c => c.close);

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 7);
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);
  const adx = calculateADX(candles, 14);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);

  // 1. EMA 9/21 crossover within last 3 candles (not just THIS candle)
  const bullCross = recentCrossover(ema9, ema21, idx, 3, 'UP');
  const bearCross = recentCrossover(ema9, ema21, idx, 3, 'DOWN');

  // 2. Trend filter
  const aboveEma50 = price > ema50[idx];
  const belowEma50 = price < ema50[idx];

  // 3. VWAP bias
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  // 4. RSI zone
  const rsiVal = rsi[idx];
  const rsiBullZone = rsiVal >= 40 && rsiVal <= 70;
  const rsiBearZone = rsiVal >= 30 && rsiVal <= 60;

  // 5. MACD histogram
  const macdBull = macdHist[idx] > 0;
  const macdBear = macdHist[idx] < 0;

  // 6. Volume + Candle quality
  const volSpike = avgVol > 0 && vol >= 1.5 * avgVol;
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.4);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.4);

  // 7. ADX trending filter
  const adxTrending = adx[idx] > 20;

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALP LONG
  // ═══════════════════════════════════════════════════════════════════════════
  if (bullCross && aboveEma50 && aboveVwap && rsiBullZone && macdBull
    && volSpike && bullCandle && adxTrending) {
    // HTF alignment: don't go long against bearish HTF
    if (htfBias === 'BEARISH') return null;

    let swingLow = Infinity;
    for (let i = idx; i > idx - 5 && i >= 0; i--) {
      if (candles[i].low < swingLow) swingLow = candles[i].low;
    }
    const risk = price - swingLow;
    if (risk <= 0) return null;

    // Dynamic TP: target nearest resistance, or 2:1 fallback
    const resistance = findNearestResistance(candles, idx, 40);
    let tp: number;
    if (resistance) {
      if ((resistance - price) < risk * 2) return null; // R:R too poor vs resistance
      tp = resistance;
    } else {
      tp = price + risk * 2;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'SCALP_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: swingLow, takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALP SHORT
  // ═══════════════════════════════════════════════════════════════════════════
  if (bearCross && belowEma50 && belowVwap && rsiBearZone && macdBear
    && volSpike && bearCandle && adxTrending) {
    if (htfBias === 'BULLISH') return null;

    let swingHigh = -Infinity;
    for (let i = idx; i > idx - 5 && i >= 0; i--) {
      if (candles[i].high > swingHigh) swingHigh = candles[i].high;
    }
    const risk = swingHigh - price;
    if (risk <= 0) return null;

    const support = findNearestSupport(candles, idx, 40);
    let tp: number;
    if (support) {
      if ((price - support) < risk * 2) return null;
      tp = support;
    } else {
      tp = price - risk * 2;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'SCALP_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: swingHigh, takeProfit: tp,
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
  offset = 1,
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 55) return null;

  const idx = bars - 1 - offset;
  if (idx < 50) return null;

  const closes = candles.map(c => c.close);

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 10);
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);
  const adx = calculateADX(candles, 14);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);

  const bullCross = recentCrossover(ema9, ema21, idx, 3, 'UP');
  const bearCross = recentCrossover(ema9, ema21, idx, 3, 'DOWN');

  const aboveEma50 = price > ema50[idx];
  const belowEma50 = price < ema50[idx];
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  const rsiVal = rsi[idx];
  const rsiBullZone = rsiVal >= 40 && rsiVal <= 70;
  const rsiBearZone = rsiVal >= 30 && rsiVal <= 60;

  const macdBull = macdHist[idx] > 0;
  const macdBear = macdHist[idx] < 0;

  const volSpike = avgVol > 0 && vol >= 1.3 * avgVol;
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.4);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.4);
  const adxTrending = adx[idx] > 20;

  // MID LONG
  if (bullCross && aboveEma50 && aboveVwap && rsiBullZone && macdBull
    && volSpike && bullCandle && adxTrending) {
    if (htfBias === 'BEARISH') return null;

    let swingLow = Infinity;
    for (let i = idx; i > idx - 8 && i >= 0; i--) {
      if (candles[i].low < swingLow) swingLow = candles[i].low;
    }
    const risk = price - swingLow;
    if (risk <= 0) return null;

    const resistance = findNearestResistance(candles, idx, 40);
    let tp: number;
    if (resistance) {
      if ((resistance - price) < risk * 2) return null;
      tp = resistance;
    } else {
      tp = price + risk * 2.5;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'MID_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: swingLow, takeProfit: tp,
    };
  }

  // MID SHORT
  if (bearCross && belowEma50 && belowVwap && rsiBearZone && macdBear
    && volSpike && bearCandle && adxTrending) {
    if (htfBias === 'BULLISH') return null;

    let swingHigh = -Infinity;
    for (let i = idx; i > idx - 8 && i >= 0; i--) {
      if (candles[i].high > swingHigh) swingHigh = candles[i].high;
    }
    const risk = swingHigh - price;
    if (risk <= 0) return null;

    const support = findNearestSupport(candles, idx, 40);
    let tp: number;
    if (support) {
      if ((price - support) < risk * 2) return null;
      tp = support;
    } else {
      tp = price - risk * 2.5;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'MID_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: swingHigh, takeProfit: tp,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWING: Multi-Confluence Swing Detector (1h / 4h)
// ═══════════════════════════════════════════════════════════════════════════════
export function detectSwingSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1,
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 210) return null;

  const idx = bars - 1 - offset;
  if (idx < 200) return null;

  const closes = candles.map(c => c.close);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const macdHist = calculateMACDHistogram(closes);
  const vwap = calculateVWAP(candles);
  const atr = calculateATR(candles, 14);
  const adx = calculateADX(candles, 14);

  const price = candles[idx].close;
  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);

  const bullCross = recentCrossover(ema20, ema50, idx, 3, 'UP');
  const bearCross = recentCrossover(ema20, ema50, idx, 3, 'DOWN');

  const aboveEma200 = price > ema200[idx];
  const belowEma200 = price < ema200[idx];
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  const rsiVal = rsi[idx];
  const rsiBullZone = rsiVal >= 45 && rsiVal <= 70;
  const rsiBearZone = rsiVal >= 30 && rsiVal <= 55;

  const macdBull = macdHist[idx] > 0;
  const macdBear = macdHist[idx] < 0;

  const volSpike = avgVol > 0 && vol >= 1.2 * avgVol;
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.4);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.4);
  const adxTrending = adx[idx] > 25; // Higher threshold for swing
  const currentATR = atr[idx];

  // SWING LONG
  if (bullCross && aboveEma200 && aboveVwap && rsiBullZone && macdBull
    && volSpike && bullCandle && adxTrending) {
    if (htfBias === 'BEARISH') return null;

    const sl = price - 1.5 * currentATR;
    const risk = price - sl;
    if (risk <= 0) return null;

    const resistance = findNearestResistance(candles, idx, 100);
    let tp: number;
    if (resistance) {
      if ((resistance - price) < risk * 2.5) return null;
      tp = resistance;
    } else {
      tp = price + risk * 3;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'SWING_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  // SWING SHORT
  if (bearCross && belowEma200 && belowVwap && rsiBearZone && macdBear
    && volSpike && bearCandle && adxTrending) {
    if (htfBias === 'BULLISH') return null;

    const sl = price + 1.5 * currentATR;
    const risk = sl - price;
    if (risk <= 0) return null;

    const support = findNearestSupport(candles, idx, 100);
    let tp: number;
    if (support) {
      if ((price - support) < risk * 2.5) return null;
      tp = support;
    } else {
      tp = price - risk * 3;
    }

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'SWING_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  return null;
}

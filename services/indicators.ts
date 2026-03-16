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

// ─── MACD (returns macdLine, signalLine, histogram) ─────────────────────────────
function calculateMACD(closes: number[]): { macdLine: number[], signalLine: number[], histogram: number[] } {
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
  return { macdLine, signalLine, histogram };
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
function calculateADX(candles: Candle[], period: number): { adx: number[], plusDI: number[], minusDI: number[] } {
  const len = candles.length;
  const adx = new Array(len).fill(0);
  const plusDIArr = new Array(len).fill(0);
  const minusDIArr = new Array(len).fill(0);
  if (len < period * 2 + 1) return { adx, plusDI: plusDIArr, minusDI: minusDIArr };

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
    const pDI = sTR === 0 ? 0 : (sPlusDM / sTR) * 100;
    const mDI = sTR === 0 ? 0 : (sMinusDM / sTR) * 100;
    plusDIArr[i] = pDI;
    minusDIArr[i] = mDI;
    const diSum = pDI + mDI;
    dx[i] = diSum === 0 ? 0 : (Math.abs(pDI - mDI) / diSum) * 100;
  }

  const adxStart = 2 * period - 1;
  if (adxStart >= len) return { adx, plusDI: plusDIArr, minusDI: minusDIArr };

  let dxSum = 0;
  for (let i = period; i <= adxStart; i++) dxSum += dx[i];
  adx[adxStart] = dxSum / period;

  for (let i = adxStart + 1; i < len; i++) {
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }
  return { adx, plusDI: plusDIArr, minusDI: minusDIArr };
}

// ─── Stochastic RSI ─────────────────────────────────────────────────────────────
function calculateStochRSI(closes: number[], rsiPeriod: number, stochPeriod: number, kSmooth: number): { k: number[], d: number[] } {
  const rsi = calculateRSI(closes, rsiPeriod);
  const stochRSI = new Array(closes.length).fill(50);

  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    let minRSI = Infinity;
    let maxRSI = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsi[j] < minRSI) minRSI = rsi[j];
      if (rsi[j] > maxRSI) maxRSI = rsi[j];
    }
    const range = maxRSI - minRSI;
    stochRSI[i] = range === 0 ? 50 : ((rsi[i] - minRSI) / range) * 100;
  }

  // %K = SMA of stochRSI
  const k = calculateSMA(stochRSI, kSmooth);
  // %D = SMA of %K
  const d = calculateSMA(k, 3);
  return { k, d };
}

// ─── Simple Moving Average ─────────────────────────────────────────────────────
function calculateSMA(data: number[], period: number): number[] {
  const sma = new Array(data.length).fill(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) {
      sum -= data[i - period];
      sma[i] = sum / period;
    } else {
      sma[i] = sum / (i + 1);
    }
  }
  return sma;
}

// ─── Bollinger Bands ────────────────────────────────────────────────────────────
function calculateBollingerBands(closes: number[], period: number, stdDevMult: number): { upper: number[], middle: number[], lower: number[] } {
  const middle = calculateSMA(closes, period);
  const upper = new Array(closes.length).fill(0);
  const lower = new Array(closes.length).fill(0);

  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - middle[i];
      sumSq += diff * diff;
    }
    const stdDev = Math.sqrt(sumSq / period);
    upper[i] = middle[i] + stdDevMult * stdDev;
    lower[i] = middle[i] - stdDevMult * stdDev;
  }

  return { upper, middle, lower };
}

// ─── Bollinger Band Width (volatility measure) ─────────────────────────────────
function calculateBBWidth(closes: number[], period: number, stdDevMult: number): number[] {
  const { upper, middle, lower } = calculateBollingerBands(closes, period, stdDevMult);
  const width = new Array(closes.length).fill(0);
  for (let i = 0; i < closes.length; i++) {
    width[i] = middle[i] === 0 ? 0 : (upper[i] - lower[i]) / middle[i] * 100;
  }
  return width;
}

// ─── Find Nearest S/R Levels ────────────────────────────────────────────────────
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

// ─── Candle Quality Check ───────────────────────────────────────────────────────
function isCandleQualified(candle: Candle, direction: 'BULL' | 'BEAR', minBodyRatio: number): boolean {
  const range = candle.high - candle.low;
  if (range === 0) return false;

  const body = Math.abs(candle.close - candle.open);
  if ((body / range) < minBodyRatio) return false;

  if (direction === 'BULL') {
    return candle.close > candle.open && (candle.close - candle.low) / range >= 0.5;
  } else {
    return candle.close < candle.open && (candle.high - candle.close) / range >= 0.5;
  }
}

// ─── Recent EMA Crossover Detection ─────────────────────────────────────────────
function recentCrossover(
  fast: number[], slow: number[], idx: number,
  window: number, direction: 'UP' | 'DOWN'
): boolean {
  if (direction === 'UP' && fast[idx] <= slow[idx]) return false;
  if (direction === 'DOWN' && fast[idx] >= slow[idx]) return false;

  for (let i = idx; i > idx - window && i > 0; i--) {
    if (direction === 'UP' && fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) return true;
    if (direction === 'DOWN' && fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) return true;
  }
  return false;
}

// ─── EMA Proximity Check (is price within X% of an EMA?) ───────────────────────
function isNearEMA(price: number, emaValue: number, tolerancePct: number): boolean {
  return Math.abs(price - emaValue) / emaValue <= tolerancePct / 100;
}

// ─── Consecutive Candle Direction ───────────────────────────────────────────────
function consecutiveDirectionCandles(candles: Candle[], idx: number, direction: 'BULL' | 'BEAR', maxLookback: number): number {
  let count = 0;
  for (let i = idx; i > idx - maxLookback && i >= 0; i--) {
    if (direction === 'BULL' && candles[i].close > candles[i].open) count++;
    else if (direction === 'BEAR' && candles[i].close < candles[i].open) count++;
    else break;
  }
  return count;
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
// SCALP: Momentum Reversal Scalper (1m)
// 
// STRATEGY: Instead of chasing momentum (which is already priced in),
// we scalp MOMENTUM RESUMPTION after micro-pullbacks into dynamic support/
// resistance (EMA zones). This catches the "second wave" of a move, which
// has higher probability than chasing the initial impulse.
//
// ENTRY LOGIC:
// 1. HTF (5m) Direction confirms trend
// 2. Price pulls back to EMA 9/21 zone on 1m (mean reversion entry)
// 3. Rejection candle forms (bounce off EMA)
// 4. RSI shows momentum resumption (not overbought/oversold extremes)
// 5. Volume confirms participation (gentle threshold)
// 6. ADX confirms trend exists (not ranging)
// 7. ATR-based volatility filter (not too dead, not too wild)
//
// RISK MANAGEMENT:
// - SL: Below/above pullback candle wick (the touch point)
// - TP: 1.5x ATR from entry (dynamic, adapts to volatility)
// - Min R:R: 1.5:1 enforced
// - Max SL: 0.5% of price (rejects overly volatile setups)
// - Min SL: 0.15% of price (rejects too-tight stops that get noise-stopped)
// ═══════════════════════════════════════════════════════════════════════════════
export function detectImpulseSignal(
  symbol: string,
  candles: Candle[],
  timeframe: string,
  offset = 1,
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 60) return null;

  const idx = bars - 1 - offset;
  if (idx < 50) return null;

  const closes = candles.map(c => c.close);
  const price = candles[idx].close;

  // ── Indicators ───────────────────────────────────────────────────────────────
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi7 = calculateRSI(closes, 7);
  const rsi14 = calculateRSI(closes, 14);
  const atr10 = calculateATR(candles, 10);
  const { adx, plusDI, minusDI } = calculateADX(candles, 14);
  const vwap = calculateVWAP(candles);
  const { macdLine, signalLine, histogram: macdHist } = calculateMACD(closes);
  const stochRSI = calculateStochRSI(closes, 14, 14, 3);

  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);
  const currentATR = atr10[idx];

  // ── Volatility Filter ───────────────────────────────────────────────────────
  // ATR must be between 0.05% and 0.5% of price
  // Too low = dead market (will get chopped), too high = too volatile for scalp
  const atrPct = (currentATR / price) * 100;
  if (atrPct < 0.03 || atrPct > 0.6) return null;

  // ── Trend Context (must have a clear trend, not ranging) ─────────────────────
  const adxVal = adx[idx];
  if (adxVal < 18) return null; // No trend = no scalp edge

  // EMA stacking: for longs ema9 > ema21, for shorts ema9 < ema21
  const emasBullStacked = ema9[idx] > ema21[idx];
  const emasBearStacked = ema9[idx] < ema21[idx];

  // ── Pullback Detection ──────────────────────────────────────────────────────
  // Check if price recently pulled back to EMA 9 or EMA 21 zone (within last 3 candles)
  let bullPullback = false;
  let bearPullback = false;
  let pullbackLow = Infinity;
  let pullbackHigh = -Infinity;

  for (let i = idx; i > idx - 4 && i >= 1; i--) {
    // Bull pullback: low touched near EMA 9 or 21, but close recovered above
    if (isNearEMA(candles[i].low, ema9[i], 0.15) || isNearEMA(candles[i].low, ema21[i], 0.15)) {
      if (candles[idx].close > ema9[idx]) {
        bullPullback = true;
        if (candles[i].low < pullbackLow) pullbackLow = candles[i].low;
      }
    }
    // Bear pullback: high touched near EMA 9 or 21, but close stayed below
    if (isNearEMA(candles[i].high, ema9[i], 0.15) || isNearEMA(candles[i].high, ema21[i], 0.15)) {
      if (candles[idx].close < ema9[idx]) {
        bearPullback = true;
        if (candles[i].high > pullbackHigh) pullbackHigh = candles[i].high;
      }
    }
  }

  // ── RSI Conditions ──────────────────────────────────────────────────────────
  const rsi7Val = rsi7[idx];
  const rsi14Val = rsi14[idx];

  // RSI bounce zone (not extreme, showing momentum resumption)
  const rsiBullZone = rsi7Val >= 40 && rsi7Val <= 68 && rsi14Val >= 45 && rsi14Val <= 65;
  const rsiBearZone = rsi7Val >= 32 && rsi7Val <= 60 && rsi14Val >= 35 && rsi14Val <= 55;

  // ── StochRSI confirmation ───────────────────────────────────────────────────
  const stochBullCross = stochRSI.k[idx] > stochRSI.d[idx] && stochRSI.k[idx] > 20 && stochRSI.k[idx] < 80;
  const stochBearCross = stochRSI.k[idx] < stochRSI.d[idx] && stochRSI.k[idx] > 20 && stochRSI.k[idx] < 80;

  // ── Volume Confirmation ─────────────────────────────────────────────────────
  // Gentle threshold — we don't need a spike, just participation above average
  const volOk = avgVol > 0 && vol >= 1.0 * avgVol;

  // ── MACD Momentum ──────────────────────────────────────────────────────────
  // MACD histogram should be in the right direction OR turning
  const macdBullMomentum = macdHist[idx] > 0 || (macdHist[idx] > macdHist[idx - 1] && macdLine[idx] > signalLine[idx] * 0.999);
  const macdBearMomentum = macdHist[idx] < 0 || (macdHist[idx] < macdHist[idx - 1] && macdLine[idx] < signalLine[idx] * 1.001);

  // ── VWAP Position ──────────────────────────────────────────────────────────
  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  // ── Candle Quality ─────────────────────────────────────────────────────────
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.3);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.3);

  // ── Not exhausted (no massive consecutive candles) ─────────────────────────
  const bullConsec = consecutiveDirectionCandles(candles, idx, 'BULL', 8);
  const bearConsec = consecutiveDirectionCandles(candles, idx, 'BEAR', 8);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALP LONG: Pullback to EMA in uptrend
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    emasBullStacked &&
    bullPullback &&
    rsiBullZone &&
    volOk &&
    bullCandle &&
    macdBullMomentum &&
    (aboveVwap || isNearEMA(price, vwap[idx], 0.1)) &&
    (stochBullCross || stochRSI.k[idx] > 30) &&
    plusDI[idx] > minusDI[idx] &&
    bullConsec <= 5 // Not exhausted
  ) {
    // HTF alignment
    if (htfBias === 'BEARISH') return null;

    // Stop Loss: below the pullback low with a small buffer
    const buffer = currentATR * 0.3;
    const sl = pullbackLow - buffer;
    const risk = price - sl;

    // Risk size checks
    const riskPct = (risk / price) * 100;
    if (risk <= 0 || riskPct < 0.08 || riskPct > 0.5) return null;

    // Take Profit: 1.5x ATR or nearest resistance, whichever is better
    const atrTarget = price + currentATR * 1.5;
    const resistance = findNearestResistance(candles, idx, 30);
    let tp: number;

    if (resistance && resistance > atrTarget) {
      tp = resistance; // Use resistance if it gives better R:R
    } else {
      tp = atrTarget;
    }

    // R:R check: minimum 1.5:1
    const reward = tp - price;
    if (reward / risk < 1.5) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'SCALP_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALP SHORT: Pullback to EMA in downtrend
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    emasBearStacked &&
    bearPullback &&
    rsiBearZone &&
    volOk &&
    bearCandle &&
    macdBearMomentum &&
    (belowVwap || isNearEMA(price, vwap[idx], 0.1)) &&
    (stochBearCross || stochRSI.k[idx] < 70) &&
    minusDI[idx] > plusDI[idx] &&
    bearConsec <= 5
  ) {
    if (htfBias === 'BULLISH') return null;

    const buffer = currentATR * 0.3;
    const sl = pullbackHigh + buffer;
    const risk = sl - price;

    const riskPct = (risk / price) * 100;
    if (risk <= 0 || riskPct < 0.08 || riskPct > 0.5) return null;

    const atrTarget = price - currentATR * 1.5;
    const support = findNearestSupport(candles, idx, 30);
    let tp: number;

    if (support && support < atrTarget) {
      tp = support;
    } else {
      tp = atrTarget;
    }

    const reward = price - tp;
    if (reward / risk < 1.5) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'SCALP_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MID-TF: Mean Reversion + Trend Following (5m / 30m)
//
// STRATEGY: Combines EMA pullback entries with Bollinger Band squeeze breakouts.
// On mid-timeframes, we want:
// 1. Clear trend (EMA stacking + ADX)
// 2. Price pulls back to EMA 21 or Bollinger middle band
// 3. RSI shows room for continuation (not extreme)
// 4. MACD confirms momentum direction
//
// RISK MANAGEMENT:
// - ATR-based stops (1.2x ATR from entry)
// - TP at 2.0-2.5x risk (dynamic based on S/R)
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
  const price = candles[idx].close;

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const { histogram: macdHist, macdLine, signalLine } = calculateMACD(closes);
  const vwap = calculateVWAP(candles);
  const { adx, plusDI, minusDI } = calculateADX(candles, 14);
  const atr14 = calculateATR(candles, 14);
  const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = calculateBollingerBands(closes, 20, 2);

  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);
  const currentATR = atr14[idx];
  const adxVal = adx[idx];

  // Trend filter
  if (adxVal < 20) return null;

  // EMA stacking
  const emasBullStacked = ema9[idx] > ema21[idx] && price > ema50[idx];
  const emasBearStacked = ema9[idx] < ema21[idx] && price < ema50[idx];

  // Pullback to EMA 21 or BB middle
  let bullPullback = false;
  let bearPullback = false;
  let pullbackLow = Infinity;
  let pullbackHigh = -Infinity;

  for (let i = idx; i > idx - 4 && i >= 1; i--) {
    if (isNearEMA(candles[i].low, ema21[i], 0.2) || isNearEMA(candles[i].low, bbMiddle[i], 0.2)) {
      if (candles[idx].close > ema21[idx]) {
        bullPullback = true;
        if (candles[i].low < pullbackLow) pullbackLow = candles[i].low;
      }
    }
    if (isNearEMA(candles[i].high, ema21[i], 0.2) || isNearEMA(candles[i].high, bbMiddle[i], 0.2)) {
      if (candles[idx].close < ema21[idx]) {
        bearPullback = true;
        if (candles[i].high > pullbackHigh) pullbackHigh = candles[i].high;
      }
    }
  }

  const rsiVal = rsi14[idx];
  const rsiBullZone = rsiVal >= 42 && rsiVal <= 68;
  const rsiBearZone = rsiVal >= 32 && rsiVal <= 58;

  const macdBull = macdHist[idx] > 0 || (macdHist[idx] > macdHist[idx - 1]);
  const macdBear = macdHist[idx] < 0 || (macdHist[idx] < macdHist[idx - 1]);

  const volOk = avgVol > 0 && vol >= 1.1 * avgVol;
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.35);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.35);

  // MID LONG
  if (emasBullStacked && bullPullback && rsiBullZone && macdBull
    && volOk && bullCandle && plusDI[idx] > minusDI[idx]) {
    if (htfBias === 'BEARISH') return null;

    const sl = pullbackLow - currentATR * 0.3;
    const risk = price - sl;
    if (risk <= 0) return null;

    const riskPct = (risk / price) * 100;
    if (riskPct > 1.0) return null;

    const resistance = findNearestResistance(candles, idx, 40);
    let tp: number;
    if (resistance && (resistance - price) >= risk * 2) {
      tp = resistance;
    } else {
      tp = price + risk * 2.5;
    }

    const reward = tp - price;
    if (reward / risk < 2.0) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'MID_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  // MID SHORT
  if (emasBearStacked && bearPullback && rsiBearZone && macdBear
    && volOk && bearCandle && minusDI[idx] > plusDI[idx]) {
    if (htfBias === 'BULLISH') return null;

    const sl = pullbackHigh + currentATR * 0.3;
    const risk = sl - price;
    if (risk <= 0) return null;

    const riskPct = (risk / price) * 100;
    if (riskPct > 1.0) return null;

    const support = findNearestSupport(candles, idx, 40);
    let tp: number;
    if (support && (price - support) >= risk * 2) {
      tp = support;
    } else {
      tp = price - risk * 2.5;
    }

    const reward = price - tp;
    if (reward / risk < 2.0) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'MID_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SWING: Professional Multi-Confluence Swing Strategy (1h / 4h)
//
// PHILOSOPHY: Swing trading is about capturing the "meat" of a multi-day move.
// We combine THREE independent edge sources for high-probability entries:
//
// EDGE 1 — STRUCTURE: Market making higher lows (uptrend) or lower highs
//   (downtrend). This is the purest form of trend identification.
//
// EDGE 2 — PULLBACK TO VALUE: Price retraces to EMA 50 or Bollinger
//   middle band in an established trend. This is where institutions add.
//
// EDGE 3 — MOMENTUM CONFIRMATION: RSI divergence detection, MACD
//   histogram turning, and StochRSI bounce all confirm that selling/buying
//   pressure is exhausting and the trend is about to resume.
//
// ENTRY: Requires EDGE 1 + (EDGE 2 OR EDGE 3) + directional filters
// EXIT:  Structure-based SL (below swing low, not arbitrary ATR),
//        S/R-based TP or 3x risk minimum
//
// RISK MANAGEMENT:
// - SL: Below/above the most recent structural swing low/high + ATR buffer
// - Max risk per trade: 2.5% from entry (rejects if too far)
// - Min risk: 0.3% (must have meaningful structure, not noise)
// - TP: Nearest major S/R level or 3:1 R:R minimum
// - R:R floor: 2.5:1 (swing trades must have large payoff to justify hold time)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Swing-Specific Helpers ──────────────────────────────────────────────────

/**
 * Find swing lows (local minimums) within lookback window.
 * A swing low requires low[i] < low[i-1] AND low[i] < low[i+1]
 * with optional depth parameter for higher-quality pivots.
 */
function findSwingLows(candles: Candle[], idx: number, lookback: number, minDepth: number = 2): number[] {
  const lows: number[] = [];
  const start = Math.max(minDepth, idx - lookback);
  for (let i = start; i < idx - minDepth + 1; i++) {
    let isSwingLow = true;
    for (let d = 1; d <= minDepth; d++) {
      if (i - d < 0 || i + d >= candles.length) { isSwingLow = false; break; }
      if (candles[i].low >= candles[i - d].low || candles[i].low >= candles[i + d].low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) lows.push(candles[i].low);
  }
  return lows;
}

/**
 * Find swing highs (local maximums) within lookback window.
 */
function findSwingHighs(candles: Candle[], idx: number, lookback: number, minDepth: number = 2): number[] {
  const highs: number[] = [];
  const start = Math.max(minDepth, idx - lookback);
  for (let i = start; i < idx - minDepth + 1; i++) {
    let isSwingHigh = true;
    for (let d = 1; d <= minDepth; d++) {
      if (i - d < 0 || i + d >= candles.length) { isSwingHigh = false; break; }
      if (candles[i].high <= candles[i - d].high || candles[i].high <= candles[i + d].high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) highs.push(candles[i].high);
  }
  return highs;
}

/**
 * Detect Higher Lows pattern (bullish structure).
 * Returns true if the last 2+ swing lows are ascending.
 */
function hasHigherLows(candles: Candle[], idx: number, lookback: number): boolean {
  const lows = findSwingLows(candles, idx, lookback, 2);
  if (lows.length < 2) return false;
  // Check last 2-3 swing lows are ascending
  const recent = lows.slice(-3);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] <= recent[i - 1]) return false;
  }
  return true;
}

/**
 * Detect Lower Highs pattern (bearish structure).
 * Returns true if the last 2+ swing highs are descending.
 */
function hasLowerHighs(candles: Candle[], idx: number, lookback: number): boolean {
  const highs = findSwingHighs(candles, idx, lookback, 2);
  if (highs.length < 2) return false;
  const recent = highs.slice(-3);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1]) return false;
  }
  return true;
}

/**
 * RSI Bullish Divergence: Price makes lower low, RSI makes higher low.
 * This is one of the strongest reversal/continuation signals in swing trading.
 */
function hasRSIBullishDivergence(candles: Candle[], rsi: number[], idx: number, lookback: number): boolean {
  // Find two recent swing lows in price
  const priceLows: { idx: number, low: number }[] = [];
  const start = Math.max(3, idx - lookback);

  for (let i = start; i < idx - 2; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low
      && candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low) {
      priceLows.push({ idx: i, low: candles[i].low });
    }
  }

  if (priceLows.length < 2) return false;

  // Check last two price lows: price lower low, RSI higher low
  const prev = priceLows[priceLows.length - 2];
  const curr = priceLows[priceLows.length - 1];

  if (curr.low < prev.low && rsi[curr.idx] > rsi[prev.idx]) {
    return true; // Bullish divergence confirmed
  }

  return false;
}

/**
 * RSI Bearish Divergence: Price makes higher high, RSI makes lower high.
 */
function hasRSIBearishDivergence(candles: Candle[], rsi: number[], idx: number, lookback: number): boolean {
  const priceHighs: { idx: number, high: number }[] = [];
  const start = Math.max(3, idx - lookback);

  for (let i = start; i < idx - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high
      && candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high) {
      priceHighs.push({ idx: i, high: candles[i].high });
    }
  }

  if (priceHighs.length < 2) return false;

  const prev = priceHighs[priceHighs.length - 2];
  const curr = priceHighs[priceHighs.length - 1];

  if (curr.high > prev.high && rsi[curr.idx] < rsi[prev.idx]) {
    return true; // Bearish divergence confirmed
  }

  return false;
}

/**
 * Bollinger Band Squeeze Detection.
 * Returns true if BB width recently contracted and is now expanding (breakout from compression).
 */
function isBBSqueezeBreakout(bbWidth: number[], idx: number, lookback: number, direction: 'UP' | 'DOWN', closes: number[], bbUpper: number[], bbLower: number[]): boolean {
  if (idx < lookback + 5) return false;

  // Find minimum BB width in lookback period
  let minWidth = Infinity;
  for (let i = idx - lookback; i < idx - 2; i++) {
    if (bbWidth[i] < minWidth) minWidth = bbWidth[i];
  }

  // Current width must be expanding from the squeeze
  const widthExpanding = bbWidth[idx] > bbWidth[idx - 1] && bbWidth[idx - 1] > bbWidth[idx - 2];
  const wasCompressed = minWidth < bbWidth[idx] * 0.7; // Squeeze was at least 30% tighter

  if (!widthExpanding || !wasCompressed) return false;

  // Price must be breaking in the right direction
  if (direction === 'UP') {
    return closes[idx] > bbUpper[idx] * 0.998; // Near or above upper band
  } else {
    return closes[idx] < bbLower[idx] * 1.002; // Near or below lower band
  }
}

/**
 * Find the most recent structural swing low below current price.
 * Used for structure-based stop loss placement.
 */
function findStructuralSwingLow(candles: Candle[], idx: number, lookback: number): number | null {
  const price = candles[idx].close;
  let bestLow = -Infinity;
  const start = Math.max(2, idx - lookback);

  for (let i = idx - 2; i >= start; i--) {
    // 2-depth swing low
    if (i - 2 >= 0 && i + 2 < candles.length) {
      if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low
        && candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low) {
        if (candles[i].low < price && candles[i].low > bestLow) {
          bestLow = candles[i].low;
          break; // Use the most recent one
        }
      }
    }
  }
  return bestLow === -Infinity ? null : bestLow;
}

/**
 * Find the most recent structural swing high above current price.
 */
function findStructuralSwingHigh(candles: Candle[], idx: number, lookback: number): number | null {
  const price = candles[idx].close;
  let bestHigh = Infinity;
  const start = Math.max(2, idx - lookback);

  for (let i = idx - 2; i >= start; i--) {
    if (i - 2 >= 0 && i + 2 < candles.length) {
      if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high
        && candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high) {
        if (candles[i].high > price && candles[i].high < bestHigh) {
          bestHigh = candles[i].high;
          break;
        }
      }
    }
  }
  return bestHigh === Infinity ? null : bestHigh;
}

/**
 * Find strong S/R zones by looking for price levels that have been tested multiple times.
 * Returns levels sorted by proximity to current price.
 */
function findStrongResistanceZone(candles: Candle[], idx: number, lookback: number, atr: number): number | null {
  const price = candles[idx].close;
  const zoneTolerance = atr * 0.5; // Levels within 0.5 ATR are "the same zone"
  const start = Math.max(0, idx - lookback);

  // Collect all swing highs
  const levels: number[] = [];
  for (let i = start + 2; i < idx - 1; i++) {
    if (i - 1 >= 0 && i + 1 < candles.length) {
      if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) {
        if (candles[i].high > price) {
          levels.push(candles[i].high);
        }
      }
    }
  }

  if (levels.length === 0) return null;

  // Cluster levels into zones and find the strongest (most touches)
  const zones: { level: number, count: number }[] = [];
  for (const lvl of levels) {
    let added = false;
    for (const zone of zones) {
      if (Math.abs(lvl - zone.level) < zoneTolerance) {
        zone.count++;
        zone.level = (zone.level + lvl) / 2; // Average the zone
        added = true;
        break;
      }
    }
    if (!added) zones.push({ level: lvl, count: 1 });
  }

  // Sort by number of touches (strongest first), then by proximity
  zones.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return Math.abs(a.level - price) - Math.abs(b.level - price);
  });

  // Return nearest strong zone (2+ touches)
  const strong = zones.find(z => z.count >= 2);
  if (strong) return strong.level;

  // Fallback to nearest single swing high
  return zones.length > 0 ? zones[0].level : null;
}

function findStrongSupportZone(candles: Candle[], idx: number, lookback: number, atr: number): number | null {
  const price = candles[idx].close;
  const zoneTolerance = atr * 0.5;
  const start = Math.max(0, idx - lookback);

  const levels: number[] = [];
  for (let i = start + 2; i < idx - 1; i++) {
    if (i - 1 >= 0 && i + 1 < candles.length) {
      if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) {
        if (candles[i].low < price) {
          levels.push(candles[i].low);
        }
      }
    }
  }

  if (levels.length === 0) return null;

  const zones: { level: number, count: number }[] = [];
  for (const lvl of levels) {
    let added = false;
    for (const zone of zones) {
      if (Math.abs(lvl - zone.level) < zoneTolerance) {
        zone.count++;
        zone.level = (zone.level + lvl) / 2;
        added = true;
        break;
      }
    }
    if (!added) zones.push({ level: lvl, count: 1 });
  }

  zones.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return Math.abs(a.level - price) - Math.abs(b.level - price);
  });

  const strong = zones.find(z => z.count >= 2);
  if (strong) return strong.level;
  return zones.length > 0 ? zones[0].level : null;
}


// ─── Main Swing Detector ────────────────────────────────────────────────────────
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
  const price = candles[idx].close;

  // ── Indicators ───────────────────────────────────────────────────────────────
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);
  const { macdLine, signalLine, histogram: macdHist } = calculateMACD(closes);
  const vwap = calculateVWAP(candles);
  const atr14 = calculateATR(candles, 14);
  const { adx, plusDI, minusDI } = calculateADX(candles, 14);
  const stochRSI = calculateStochRSI(closes, 14, 14, 3);
  const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = calculateBollingerBands(closes, 20, 2);
  const bbWidth = calculateBBWidth(closes, 20, 2);

  const vol = candles[idx].volume;
  const avgVol = volumeSMA(candles, 20, idx - 1);
  const currentATR = atr14[idx];
  const adxVal = adx[idx];

  // ── EDGE 1: Market Structure Assessment ─────────────────────────────────────
  const bullishStructure = hasHigherLows(candles, idx, 60);
  const bearishStructure = hasLowerHighs(candles, idx, 60);

  // ── EMA Configuration ──────────────────────────────────────────────────────
  // Full stack: EMA 20 > 50 > 200 for longs (strongest)
  // Partial: EMA 20 > 50, price > 200 (still valid)
  const fullBullStack = ema20[idx] > ema50[idx] && ema50[idx] > ema200[idx] && price > ema20[idx];
  const partialBullStack = ema20[idx] > ema50[idx] && price > ema200[idx];
  const fullBearStack = ema20[idx] < ema50[idx] && ema50[idx] < ema200[idx] && price < ema20[idx];
  const partialBearStack = ema20[idx] < ema50[idx] && price < ema200[idx];

  // ── EDGE 2: Pullback to Value Zone ─────────────────────────────────────────
  // Price recently touched EMA 50 or Bollinger middle band (institutional buy zone)
  let bullPullbackToValue = false;
  let bearPullbackToValue = false;
  let pullbackSwingLow = Infinity;
  let pullbackSwingHigh = -Infinity;

  for (let i = idx; i > idx - 8 && i >= 1; i--) {
    // Bull: wick touched EMA 50 or BB middle, close recovered above EMA 20
    if (isNearEMA(candles[i].low, ema50[i], 0.5) || isNearEMA(candles[i].low, bbMiddle[i], 0.4)) {
      if (candles[idx].close > ema20[idx]) {
        bullPullbackToValue = true;
        if (candles[i].low < pullbackSwingLow) pullbackSwingLow = candles[i].low;
      }
    }
    // Also check pullback to EMA 20 (shallower pullback in strong trend)
    if (fullBullStack && isNearEMA(candles[i].low, ema20[i], 0.3)) {
      bullPullbackToValue = true;
      if (candles[i].low < pullbackSwingLow) pullbackSwingLow = candles[i].low;
    }

    // Bear: wick touched EMA 50 or BB middle, close stayed below EMA 20
    if (isNearEMA(candles[i].high, ema50[i], 0.5) || isNearEMA(candles[i].high, bbMiddle[i], 0.4)) {
      if (candles[idx].close < ema20[idx]) {
        bearPullbackToValue = true;
        if (candles[i].high > pullbackSwingHigh) pullbackSwingHigh = candles[i].high;
      }
    }
    if (fullBearStack && isNearEMA(candles[i].high, ema20[i], 0.3)) {
      bearPullbackToValue = true;
      if (candles[i].high > pullbackSwingHigh) pullbackSwingHigh = candles[i].high;
    }
  }

  // ── EDGE 3: Momentum Confirmation ─────────────────────────────────────────
  // RSI Divergence (strongest reversal/continuation signal)
  const bullDivergence = hasRSIBullishDivergence(candles, rsi14, idx, 40);
  const bearDivergence = hasRSIBearishDivergence(candles, rsi14, idx, 40);

  // MACD histogram turning (momentum shift)
  const macdBullTurn = macdHist[idx] > macdHist[idx - 1] && macdHist[idx - 1] > macdHist[idx - 2];
  const macdBearTurn = macdHist[idx] < macdHist[idx - 1] && macdHist[idx - 1] < macdHist[idx - 2];
  const macdBullConfirm = macdHist[idx] > 0 || macdBullTurn;
  const macdBearConfirm = macdHist[idx] < 0 || macdBearTurn;

  // MACD crossover (trend confirmation)
  const macdBullCross = macdLine[idx] > signalLine[idx] && macdLine[idx - 1] <= signalLine[idx - 1];
  const macdBearCross = macdLine[idx] < signalLine[idx] && macdLine[idx - 1] >= signalLine[idx - 1];

  // StochRSI momentum
  const stochBullMomentum = stochRSI.k[idx] > stochRSI.d[idx] && stochRSI.k[idx] > 20 && stochRSI.k[idx] < 85;
  const stochBearMomentum = stochRSI.k[idx] < stochRSI.d[idx] && stochRSI.k[idx] > 15 && stochRSI.k[idx] < 80;

  // Bollinger squeeze breakout
  const bbBullBreakout = isBBSqueezeBreakout(bbWidth, idx, 20, 'UP', closes, bbUpper, bbLower);
  const bbBearBreakout = isBBSqueezeBreakout(bbWidth, idx, 20, 'DOWN', closes, bbUpper, bbLower);

  // ── Directional Filters ────────────────────────────────────────────────────
  const rsiVal = rsi14[idx];
  const rsiBullOk = rsiVal >= 40 && rsiVal <= 72;     // Room to run up
  const rsiBearOk = rsiVal >= 28 && rsiVal <= 60;     // Room to run down
  const rsiNotExtremeBull = rsiVal < 78;               // Not overbought
  const rsiNotExtremeBear = rsiVal > 22;               // Not oversold

  const aboveVwap = price > vwap[idx];
  const belowVwap = price < vwap[idx];

  // Volume: need confirmation but not chasing — 1.1x average is enough for swings
  const volConfirm = avgVol > 0 && vol >= 1.1 * avgVol;

  // Candle quality (rejection/engulfing)
  const bullCandle = isCandleQualified(candles[idx], 'BULL', 0.35);
  const bearCandle = isCandleQualified(candles[idx], 'BEAR', 0.35);

  // DI direction
  const bullDI = plusDI[idx] > minusDI[idx];
  const bearDI = minusDI[idx] > plusDI[idx];

  // ADX trending (lower threshold for swing — can catch transitions)
  const trending = adxVal > 20;

  // Not exhausted
  const bullConsec = consecutiveDirectionCandles(candles, idx, 'BULL', 12);
  const bearConsec = consecutiveDirectionCandles(candles, idx, 'BEAR', 12);

  // ═══════════════════════════════════════════════════════════════════════════
  // SWING LONG — Entry Decision Matrix
  //
  // Required: Structure (higher lows) OR EMA stack (partial minimum)
  // Required: At least ONE of [pullback-to-value, RSI divergence, BB squeeze]
  // Required: Momentum confirmation (MACD + RSI zone)
  // Required: Directional filters (DI, VWAP, candle, volume)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasLongStructure = bullishStructure || fullBullStack || partialBullStack;
  const hasLongEdge = bullPullbackToValue || bullDivergence || bbBullBreakout;
  const hasLongMomentum = macdBullConfirm && (stochBullMomentum || macdBullCross);

  if (
    hasLongStructure &&
    hasLongEdge &&
    hasLongMomentum &&
    rsiBullOk &&
    rsiNotExtremeBull &&
    (aboveVwap || isNearEMA(price, vwap[idx], 0.3)) &&
    volConfirm &&
    bullCandle &&
    bullDI &&
    trending &&
    bullConsec <= 7
  ) {
    if (htfBias === 'BEARISH') return null;

    // ── Structure-Based Stop Loss ─────────────────────────────────────────
    // Find the most recent structural swing low below price
    const structuralSL = findStructuralSwingLow(candles, idx, 30);
    let sl: number;

    if (structuralSL && structuralSL < price) {
      // Place SL below the structural swing low with ATR buffer
      sl = structuralSL - currentATR * 0.5;
    } else if (pullbackSwingLow < price && pullbackSwingLow !== Infinity) {
      // Use the pullback low
      sl = pullbackSwingLow - currentATR * 0.4;
    } else {
      // Fallback: 2x ATR (wider than scalp, appropriate for swing)
      sl = price - 2.0 * currentATR;
    }

    const risk = price - sl;
    if (risk <= 0) return null;

    // Risk size validation
    const riskPct = (risk / price) * 100;
    if (riskPct < 0.3 || riskPct > 2.5) return null; // 0.3% - 2.5% risk band

    // ── Target: Nearest strong resistance zone or 3x risk ───────────────
    const strongResistance = findStrongResistanceZone(candles, idx, 100, currentATR);
    const simpleResistance = findNearestResistance(candles, idx, 100);
    let tp: number;

    if (strongResistance && (strongResistance - price) >= risk * 2.5) {
      tp = strongResistance; // Strong zone target
    } else if (simpleResistance && (simpleResistance - price) >= risk * 2.5) {
      tp = simpleResistance;
    } else {
      tp = price + risk * 3; // 3:1 R:R minimum for swings
    }

    // R:R floor check
    const reward = tp - price;
    if (reward / risk < 2.5) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BULLISH', signal: 'SWING_LONG',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWING SHORT — Entry Decision Matrix
  // ═══════════════════════════════════════════════════════════════════════════
  const hasShortStructure = bearishStructure || fullBearStack || partialBearStack;
  const hasShortEdge = bearPullbackToValue || bearDivergence || bbBearBreakout;
  const hasShortMomentum = macdBearConfirm && (stochBearMomentum || macdBearCross);

  if (
    hasShortStructure &&
    hasShortEdge &&
    hasShortMomentum &&
    rsiBearOk &&
    rsiNotExtremeBear &&
    (belowVwap || isNearEMA(price, vwap[idx], 0.3)) &&
    volConfirm &&
    bearCandle &&
    bearDI &&
    trending &&
    bearConsec <= 7
  ) {
    if (htfBias === 'BULLISH') return null;

    // ── Structure-Based Stop Loss ─────────────────────────────────────────
    const structuralSL = findStructuralSwingHigh(candles, idx, 30);
    let sl: number;

    if (structuralSL && structuralSL > price) {
      sl = structuralSL + currentATR * 0.5;
    } else if (pullbackSwingHigh > price && pullbackSwingHigh !== -Infinity) {
      sl = pullbackSwingHigh + currentATR * 0.4;
    } else {
      sl = price + 2.0 * currentATR;
    }

    const risk = sl - price;
    if (risk <= 0) return null;

    const riskPct = (risk / price) * 100;
    if (riskPct < 0.3 || riskPct > 2.5) return null;

    // ── Target ──────────────────────────────────────────────────────────
    const strongSupport = findStrongSupportZone(candles, idx, 100, currentATR);
    const simpleSupport = findNearestSupport(candles, idx, 100);
    let tp: number;

    if (strongSupport && (price - strongSupport) >= risk * 2.5) {
      tp = strongSupport;
    } else if (simpleSupport && (price - simpleSupport) >= risk * 2.5) {
      tp = simpleSupport;
    } else {
      tp = price - risk * 3;
    }

    const reward = price - tp;
    if (reward / risk < 2.5) return null;

    return {
      symbol, price: candles[bars - 1].close, timeframe,
      type: 'BEARISH', signal: 'SWING_SHORT',
      timestamp: candles[idx].time,
      entryPrice: price, stopLoss: sl, takeProfit: tp,
    };
  }

  return null;
}

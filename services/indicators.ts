import { Candle, StrategyMatch } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: EMA
// ─────────────────────────────────────────────────────────────────────────────
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return ema;

  // Find first non-NaN index
  const startIndex = data.findIndex(v => !isNaN(v));
  if (startIndex < 0 || data.length - startIndex < period) return ema;

  let sum = 0;
  const initEnd = startIndex + period;
  for (let i = startIndex; i < initEnd; i++) sum += data[i];
  ema[initEnd - 1] = sum / period;

  const k = 2 / (period + 1);
  for (let i = initEnd; i < data.length; i++) {
    if (!isNaN(data[i])) {
      ema[i] = (data[i] - ema[i - 1]) * k + ema[i - 1];
    } else {
      ema[i] = ema[i - 1];
    }
  }
  return ema;
}


// ─────────────────────────────────────────────────────────────────────────────
//  Helper: MACD Histogram
// ─────────────────────────────────────────────────────────────────────────────
function calculateMACDHistogram(closes: number[]): number[] {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = closes.map((_, i) => !isNaN(ema12[i]) && !isNaN(ema26[i]) ? ema12[i] - ema26[i] : NaN);
  const validStart = macdLine.findIndex(v => !isNaN(v));
  if (validStart < 0) return closes.map(() => NaN);
  const macdCompact = macdLine.slice(validStart);
  const signalCompact = calculateEMA(macdCompact, 9);
  const histogram = closes.map(() => NaN);
  for (let i = 0; i < signalCompact.length; i++) {
    const orig = validStart + i;
    if (!isNaN(signalCompact[i])) histogram[orig] = macdCompact[i] - signalCompact[i];
  }
  return histogram;
}

// ─────────────────────────────────────────────────────────────────────────────
function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    let gain = 0;
    let loss = 0;
    if (diff > 0) gain = diff;
    else loss = Math.abs(diff);

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      rsi[i] = 100 - (100 / (1 + (avgGain / avgLoss)));
    }
  }

  return rsi;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: ATR (Average True Range)
// ─────────────────────────────────────────────────────────────────────────────
function calculateATR(candles: Candle[], period: number = 14): number[] {
  const atr: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return atr;

  const tr: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;

  for (let i = period + 1; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: VWMA (Volume Weighted Moving Average)
// ─────────────────────────────────────────────────────────────────────────────
function calculateVWMA(candles: Candle[], period: number = 20): number[] {
  const vwma: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period) return vwma;

  for (let i = period - 1; i < candles.length; i++) {
    let sumPV = 0;
    let sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += candles[j].close * candles[j].volume;
      sumV += candles[j].volume;
    }
    vwma[i] = sumV === 0 ? candles[i].close : sumPV / sumV;
  }
  return vwma;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: ADX (Average Directional Index)
// ─────────────────────────────────────────────────────────────────────────────
function calculateADX(candles: Candle[], period: number = 14): { adx: number[], plusDI: number[], minusDI: number[] } {
  const tr: number[] = new Array(candles.length).fill(0);
  const plusDM: number[] = new Array(candles.length).fill(0);
  const minusDM: number[] = new Array(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
    if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
  }

  const smooth = (data: number[], p: number) => {
    const res: number[] = new Array(data.length).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= p; i++) sum += data[i];
    res[p] = sum;
    for (let i = p + 1; i < data.length; i++) {
      res[i] = res[i - 1] - (res[i - 1] / p) + data[i];
    }
    return res;
  };

  const smoothedTR = smooth(tr, period);
  const smoothedPlusDM = smooth(plusDM, period);
  const smoothedMinusDM = smooth(minusDM, period);

  const plusDI: number[] = new Array(candles.length).fill(NaN);
  const minusDI: number[] = new Array(candles.length).fill(NaN);
  const dx: number[] = new Array(candles.length).fill(NaN);

  for (let i = period; i < candles.length; i++) {
    if (smoothedTR[i] === 0) {
      plusDI[i] = 0;
      minusDI[i] = 0;
      dx[i] = 0;
    } else {
      plusDI[i] = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      minusDI[i] = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      const diDiff = Math.abs(plusDI[i] - minusDI[i]);
      const diSum = plusDI[i] + minusDI[i];
      dx[i] = diSum === 0 ? 0 : (diDiff / diSum) * 100;
    }
  }

  const adx: number[] = new Array(candles.length).fill(NaN);
  let dxSum = 0;
  let count = 0;
  for (let i = period; i < period * 2; i++) {
    if (!isNaN(dx[i])) { dxSum += dx[i]; count++; }
  }

  if (count > 0) {
    adx[period * 2 - 1] = dxSum / count;
    for (let i = period * 2; i < candles.length; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }

  return { adx, plusDI, minusDI };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: Bollinger Bands
// ─────────────────────────────────────────────────────────────────────────────
function calculateBollingerBands(closes: number[], period: number = 20, multiplier: number = 2): { upper: number[], lower: number[], basis: number[] } {
  const basis: number[] = new Array(closes.length).fill(NaN);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);

  if (closes.length < period) return { upper, lower, basis };

  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const mean = sum / period;
    basis[i] = mean;

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(closes[j] - mean, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);

    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
  }

  return { upper, lower, basis };
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  EMA 5/8 Crossover Implementation
// ─────────────────────────────────────────────────────────────────────────────
export function checkEMACross(symbol: string, candles: Candle[], timeframe: string, offset = 0): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 20) return null;

  // 1. Logic Selection: Bullish or Bearish Impulse Momentum
  // - Bullish Impulse: 2-3 green candles
  // - Pullback: 1 candle (Red or Small Body)
  // - Confirmation: Green, closes above all pullback highs
  // - Requirement: Confirmation candle must be CLOSED (not live).

  const isBullish = (c: Candle) => c.close > c.open;
  const isBearish = (c: Candle) => c.close < c.open;
  const isSmallBody = (c: Candle) => {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    return range === 0 ? true : body <= range * 0.35; // Body is < 35% of total range
  };

  let mode: 'BULL' | 'BEAR' | 'NONE' = 'NONE';

  // We identify the confirmation candle index.
  // offset = 0 means the live candle, offset = 1 means the last closed candle.
  const finalIdx = bars - 1 - offset;
  if (finalIdx < 10) return null;

  const closes = candles.map(c => c.close);
  const currentPrice = candles[bars - 1].close; // Still use latest price for entry

  const checkBullish = (endIdx: number): boolean => {
    const conf = candles[endIdx];
    if (!isBullish(conf)) return false;

    const pbLen = 1;
    const pbStart = endIdx - pbLen;
    const pbCandles = candles.slice(pbStart, endIdx);
    if (pbCandles.every(c => isBearish(c) || isSmallBody(c))) {
      const pbHigh = Math.max(...pbCandles.map(c => c.high));
      if (conf.close > pbHigh) {
        for (let impLen = 2; impLen <= 3; impLen++) {
          const impStart = pbStart - impLen;
          if (impStart >= 0) {
            const impCandles = candles.slice(impStart, pbStart);
            if (impCandles.every(c => isBullish(c))) return true;
          }
        }
      }
    }
    return false;
  };

  const checkBearish = (endIdx: number): boolean => {
    const conf = candles[endIdx];
    if (!isBearish(conf)) return false;

    const pbLen = 1;
    const pbStart = endIdx - pbLen;
    const pbCandles = candles.slice(pbStart, endIdx);
    if (pbCandles.every(c => isBullish(c) || isSmallBody(c))) {
      const pbLow = Math.min(...pbCandles.map(c => c.low));
      if (conf.close < pbLow) {
        for (let impLen = 2; impLen <= 3; impLen++) {
          const impStart = pbStart - impLen;
          if (impStart >= 0) {
            const impCandles = candles.slice(impStart, pbStart);
            if (impCandles.every(c => isBearish(c))) return true;
          }
        }
      }
    }
    return false;
  };

  if (checkBullish(finalIdx)) mode = 'BULL';
  else if (checkBearish(finalIdx)) mode = 'BEAR';

  if (mode === 'NONE') return null;

  // 2. Momentum & Volatility Confirmation using 'finalIdx' (The closed confirmation bar)
  const finalPrevIdx = finalIdx - 1;
  const macdHist = calculateMACDHistogram(closes);
  if (mode === 'BULL') {
    if (macdHist[finalIdx] <= 0 || macdHist[finalIdx] <= macdHist[finalPrevIdx]) return null;
  } else {
    if (macdHist[finalIdx] >= 0 || macdHist[finalIdx] >= macdHist[finalPrevIdx]) return null;
  }

  const rsiArr = calculateRSI(closes, 14);
  if (mode === 'BULL') {
    if (rsiArr[finalIdx] < 40 || rsiArr[finalIdx] > 80) return null;
  } else {
    if (rsiArr[finalIdx] > 60 || rsiArr[finalIdx] < 20) return null;
  }

  // 3. Volume Verification
  const volumes = candles.map(c => c.volume);
  let avgVol = 0;
  for (let i = Math.max(0, finalIdx - 20); i <= finalIdx; i++) avgVol += volumes[i];
  avgVol /= 21;

  if (volumes[finalIdx] < avgVol * 1.1) return null; // Relaxed slightly from 1.2 to 1.1

  // 4. Trend & Institutional Filters
  const adxArr = calculateADX(candles, 14).adx;
  if (!isNaN(adxArr[finalIdx]) && adxArr[finalIdx] < 18) return null;

  const vwmaArr = calculateVWMA(candles, 20);
  if (mode === 'BULL' && candles[finalIdx].close < vwmaArr[finalIdx]) return null;
  if (mode === 'BEAR' && candles[finalIdx].close > vwmaArr[finalIdx]) return null;

  const bb = calculateBollingerBands(closes, 20, 2);
  if (mode === 'BULL' && candles[finalIdx].close < bb.upper[finalIdx]) return null;
  if (mode === 'BEAR' && candles[finalIdx].close > bb.lower[finalIdx]) return null;

  const atrArr = calculateATR(candles, 14);
  const atr = atrArr[finalIdx];

  return {
    symbol,
    price: currentPrice,
    timeframe,
    type: mode === 'BULL' ? 'BULLISH' : 'BEARISH',
    signal: mode === 'BULL' ? 'MOMENTUM_BULL' : 'MOMENTUM_BEAR', // Updated signal ID
    timestamp: candles[finalIdx].time,
    entryPrice: candles[finalIdx].close,
    stopLoss: mode === 'BULL' ? currentPrice - (atr * 1.5) : currentPrice + (atr * 1.5),
    takeProfit: mode === 'BULL' ? currentPrice + (atr * 3.75) : currentPrice - (atr * 3.75),
  };
}

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
// ─────────────────────────────────────────────────────────────────────────────
//  EMA 5/8 Crossover Implementation
// ─────────────────────────────────────────────────────────────────────────────
export function checkEMACross(symbol: string, candles: Candle[], timeframe: string, offset = 0): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 50) return null;

  const idx = bars - 1 - offset;
  const prevIdx = idx - 1;
  if (prevIdx < 0) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const ema5Arr = calculateEMA(closes, 5);
  const ema8Arr = calculateEMA(closes, 8);
  const macdHist = calculateMACDHistogram(closes);
  const rsiArr = calculateRSI(closes, 14);
  const atrArr = calculateATR(candles, 14);
  const vwmaArr = calculateVWMA(candles, 20);
  const adxResult = calculateADX(candles, 14);
  const adxArr = adxResult.adx;

  // Calculate Average Volume (20 period)
  let avgVol = 0;
  let volCount = 0;
  for (let i = Math.max(0, idx - 20); i <= idx; i++) {
    avgVol += volumes[i];
    volCount++;
  }
  avgVol = volCount > 0 ? avgVol / volCount : 0;

  // 50 EMA Baseline Trend Filter
  const ema50Arr = calculateEMA(closes, 50);

  if (isNaN(ema5Arr[idx]) || isNaN(ema8Arr[idx]) || isNaN(macdHist[idx]) || isNaN(rsiArr[idx]) || isNaN(atrArr[idx]) || isNaN(adxArr[idx]) || isNaN(vwmaArr[idx])) return null;
  if (isNaN(ema5Arr[prevIdx]) || isNaN(ema8Arr[prevIdx]) || isNaN(macdHist[prevIdx])) return null;

  // Check for recent cross in the last 3 candles to avoid missing trades
  let bullishCrossRecent = false;
  let bearishCrossRecent = false;
  for (let i = 0; i <= 3; i++) {
    const cIdx = idx - i;
    const pIdx = cIdx - 1;
    if (pIdx >= 0) {
      if (ema5Arr[cIdx] > ema8Arr[cIdx] && ema5Arr[pIdx] <= ema8Arr[pIdx]) bullishCrossRecent = true;
      if (ema5Arr[cIdx] < ema8Arr[cIdx] && ema5Arr[pIdx] >= ema8Arr[pIdx]) bearishCrossRecent = true;
    }
  }

  // BULLISH: EMA-5 crossed above EMA-8 recently AND remains above currently
  if (bullishCrossRecent && ema5Arr[idx] > ema8Arr[idx]) {
    // 1. Long-Term Trend Filter: Only go long if price is above the 50 EMA
    if (!isNaN(ema50Arr[idx]) && closes[idx] < ema50Arr[idx]) return null;

    // 2. Accelerating MACD Momentum: Histogram must be strictly positive AND growing
    if (macdHist[idx] <= 0 || macdHist[idx] <= macdHist[prevIdx]) return null;

    // 3. RSI Filter: Avoid overbought conditions + ensure momentum
    if (rsiArr[idx] < 40 || rsiArr[idx] > 75) return null;

    // 4. Volume Confirmation: Must be elevated (1.2x) but NOT a blow-off top climax (>5x)
    if (volumes[idx] < avgVol * 1.2 || volumes[idx] > avgVol * 5.0) return null;

    // 5. Price Action / Close Strength: Candle should close in its upper 50%
    const candle = candles[idx];
    const range = candle.high - candle.low;
    if (range > 0 && (candle.close - candle.low) / range < 0.5) return null;

    // 6. ADX Trend Filter: The market MUST be genuinely trending (ADX > 20)
    // Avoids chop and ensures momentum is actively expanding.
    if (adxArr[idx] < 20) return null;

    // 7. Institutional VWMA (Volume Weighted MA): Ensure price is above institutional average cost basis
    if (closes[idx] < vwmaArr[idx]) return null;

    const entryPrice = closes[idx];
    const atr = atrArr[idx];
    // Dynamic Stop Loss based on ATR
    const stopLoss = entryPrice - (atr * 1.5);
    // Dynamic Take Profit based on Risk/Reward of 1:2.5
    const takeProfit = entryPrice + (atr * 3.75);

    return {
      symbol, price: entryPrice, timeframe, type: 'BULLISH', signal: 'EMA_CROSS_BULL',
      timestamp: candles[idx].time,
      entryPrice, stopLoss, takeProfit,
    };
  }

  // BEARISH: EMA-5 crossed below EMA-8 recently AND remains below currently
  if (bearishCrossRecent && ema5Arr[idx] < ema8Arr[idx]) {
    // 1. Long-Term Trend Filter: Only go short if price is below the 50 EMA
    if (!isNaN(ema50Arr[idx]) && closes[idx] > ema50Arr[idx]) return null;

    // 2. Accelerating MACD Momentum: Histogram must be strictly negative AND increasingly negative
    if (macdHist[idx] >= 0 || macdHist[idx] >= macdHist[prevIdx]) return null;

    // 3. RSI Filter: Avoid oversold conditions + ensure momentum
    if (rsiArr[idx] > 60 || rsiArr[idx] < 25) return null;

    // 4. Volume Confirmation: Must be elevated (1.2x) but NOT a capitulation bottom (>5x)
    if (volumes[idx] < avgVol * 1.2 || volumes[idx] > avgVol * 5.0) return null;

    // 5. Price Action / Close Strength: Candle should close in its lower 50%
    const candle = candles[idx];
    const range = candle.high - candle.low;
    if (range > 0 && (candle.high - candle.close) / range < 0.5) return null;

    // 6. ADX Trend Filter: The market MUST be genuinely trending (ADX > 20)
    // Avoids chop and ensures momentum is actively expanding.
    if (adxArr[idx] < 20) return null;

    // 7. Institutional VWMA (Volume Weighted MA): Ensure price is below institutional average cost basis
    if (closes[idx] > vwmaArr[idx]) return null;

    const entryPrice = closes[idx];
    const atr = atrArr[idx];

    // Dynamic Stop Loss based on ATR
    const stopLoss = entryPrice + (atr * 1.5);
    // Dynamic Take Profit based on Risk/Reward of 1:2.5
    const takeProfit = entryPrice - (atr * 3.75);

    return {
      symbol, price: entryPrice, timeframe, type: 'BEARISH', signal: 'EMA_CROSS_BEAR',
      timestamp: candles[idx].time,
      entryPrice, stopLoss, takeProfit,
    };
  }

  return null;
}

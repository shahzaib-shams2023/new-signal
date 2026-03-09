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
// ─────────────────────────────────────────────────────────────────────────────
//  EMA 5/8 Crossover Implementation
// ─────────────────────────────────────────────────────────────────────────────
export function checkEMACross(symbol: string, candles: Candle[], timeframe: string, offset = 0): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 35) return null;

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

  // Calculate Average Volume (20 period)
  let avgVol = 0;
  let volCount = 0;
  for (let i = Math.max(0, idx - 20); i <= idx; i++) {
    avgVol += volumes[i];
    volCount++;
  }
  avgVol = volCount > 0 ? avgVol / volCount : 0;

  if (isNaN(ema5Arr[idx]) || isNaN(ema8Arr[idx]) || isNaN(macdHist[idx]) || isNaN(rsiArr[idx]) || isNaN(atrArr[idx])) return null;
  if (isNaN(ema5Arr[prevIdx]) || isNaN(ema8Arr[prevIdx])) return null;

  // BULLISH: EMA-5 crosses above EMA-8 AND MACD Histogram is positive
  if (ema5Arr[idx] > ema8Arr[idx] && ema5Arr[prevIdx] <= ema8Arr[prevIdx]) {
    // Strictly positive MACD Histogram validation
    if (macdHist[idx] <= 0) return null;
    // RSI Filter: Avoid overbought conditions + ensure momentum
    if (rsiArr[idx] < 40 || rsiArr[idx] > 75) return null;
    // Volume Confirmation: Current candle volume must be at least 1.2x the average volume
    if (volumes[idx] < avgVol * 1.2) return null;

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

  // BEARISH: EMA-5 crosses below EMA-8 AND MACD Histogram is negative
  if (ema5Arr[idx] < ema8Arr[idx] && ema5Arr[prevIdx] >= ema8Arr[prevIdx]) {
    // Strictly negative MACD Histogram validation
    if (macdHist[idx] >= 0) return null;
    // RSI Filter: Avoid oversold conditions + ensure momentum
    if (rsiArr[idx] > 60 || rsiArr[idx] < 25) return null;
    // Volume Confirmation: Current candle volume must be at least 1.2x the average volume
    if (volumes[idx] < avgVol * 1.2) return null;

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

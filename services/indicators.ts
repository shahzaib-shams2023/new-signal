import { Candle, StrategyMatch } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: EMA
// ─────────────────────────────────────────────────────────────────────────────
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return ema;

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

/**
 * Detects Bullish/Bearish signals based on 2-3 impulse candles with increasing volume,
 * validated by the MACD Histogram.
 */
export function detectImpulseSignal(symbol: string, candles: Candle[], timeframe: string, offset = 1): StrategyMatch | null {
  const bars = candles.length;
  if (bars < 30) return null;

  const finalIdx = bars - 1 - offset;
  if (finalIdx < 5) return null;

  const closes = candles.map(c => c.close);
  const histogram = calculateMACDHistogram(closes);
  const currentHist = histogram[finalIdx];

  const isGreen = (i: number) => candles[i].close > candles[i].open;
  const isRed = (i: number) => candles[i].close < candles[i].open;
  const volIncreased = (i: number) => candles[i].volume > candles[i - 1].volume;

  let mode: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';

  const bull2 = isGreen(finalIdx) && volIncreased(finalIdx) &&
    isGreen(finalIdx - 1) && volIncreased(finalIdx - 1);

  if (bull2 && currentHist > 0) {
    mode = 'BULLISH';
  }

  const bear2 = isRed(finalIdx) && volIncreased(finalIdx) &&
    isRed(finalIdx - 1) && volIncreased(finalIdx - 1);

  if (bear2 && currentHist < 0) {
    mode = 'BEARISH';
  }

  if (mode === 'NONE') return null;

  const currentPrice = candles[bars - 1].close;
  const signalId = mode === 'BULLISH' ? 'IMPULSE_BULL' : 'IMPULSE_BEAR';

  return {
    symbol,
    price: currentPrice,
    timeframe,
    type: mode,
    signal: signalId,
    timestamp: candles[finalIdx].time,
    entryPrice: closes[finalIdx],
    stopLoss: mode === 'BULLISH' ? candles[finalIdx].low : candles[finalIdx].high,
    takeProfit: mode === 'BULLISH' ? currentPrice * 1.02 : currentPrice * 0.98,
  };
}

/**
 * Detects Parabolic Volume signals where volume is significantly higher (3.5x+) 
 * than the average of the previous 20 candles.
 */
export function detectParabolicSignal(symbol: string, candles: Candle[], timeframe: string, offset = 1): StrategyMatch | null {
  const bars = candles.length;
  const period = 20;
  if (bars < period + 2) return null;

  const finalIdx = bars - 1 - offset;
  if (finalIdx < period) return null;

  // Calculate average volume of previous 20 candles (excluding current)
  let sumVol = 0;
  for (let i = finalIdx - period; i < finalIdx; i++) {
    sumVol += candles[i].volume;
  }
  const avgVol = sumVol / period;
  const currentVol = candles[finalIdx].volume;

  // Check if current volume is at least 3.5x the average
  const isParabolic = currentVol > avgVol * 3.5;
  if (!isParabolic) return null;

  const isGreen = candles[finalIdx].close > candles[finalIdx].open;
  const mode: 'BULLISH' | 'BEARISH' = isGreen ? 'BULLISH' : 'BEARISH';
  const signalId = isGreen ? 'PARABOLIC_BULL' : 'PARABOLIC_BEAR';

  return {
    symbol,
    price: candles[bars - 1].close,
    timeframe,
    type: mode,
    signal: signalId,
    timestamp: candles[finalIdx].time,
    entryPrice: candles[finalIdx].close,
    stopLoss: isGreen ? candles[finalIdx].low : candles[finalIdx].high,
    takeProfit: isGreen ? candles[finalIdx].close * 1.05 : candles[finalIdx].close * 0.95,
  };
}

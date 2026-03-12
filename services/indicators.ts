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
 * Detects Bullish/Bearish signals based on:
 * 1. Impulse Phase: 2-3 candles with increasing volume.
 * 2. Pullback Phase: Exactly 1 opposite color candle that stays within the impulse range.
 * 3. Confirmation Phase: 1 candle that closes beyond the pullback candle.
 */
export function detectImpulseSignal(symbol: string, candles: Candle[], timeframe: string, offset = 1): StrategyMatch | null {
  const bars = candles.length;
  // Sequence needs: 2-3 Impulse + 1 Pullback + 1 Confirm = 4-5 candles.
  if (bars < 35) return null;

  const finalIdx = bars - 1 - offset; // The Confirmation Candle (must be closed)
  if (finalIdx < 6) return null;

  const closes = candles.map(c => c.close);
  const histogram = calculateMACDHistogram(closes);
  const currentHist = histogram[finalIdx];

  const isGreen = (i: number) => candles[i].close > candles[i].open;
  const isRed = (i: number) => candles[i].close < candles[i].open;

  // BULLISH Logic
  if (isGreen(finalIdx) && isRed(finalIdx - 1)) {
    const confirmG = candles[finalIdx];
    const pullbackR = candles[finalIdx - 1];

    if (confirmG.close > pullbackR.high) {
      // Check for 3-candle impulse (V3 > V2 > V1)
      if (finalIdx - 4 >= 0 &&
        isGreen(finalIdx - 2) && isGreen(finalIdx - 3) && isGreen(finalIdx - 4) &&
        candles[finalIdx - 2].volume > candles[finalIdx - 3].volume &&
        candles[finalIdx - 3].volume > candles[finalIdx - 4].volume
      ) {
        const impulseLows = [candles[finalIdx - 2].low, candles[finalIdx - 3].low, candles[finalIdx - 4].low];
        const minL = Math.min(...impulseLows);
        if (pullbackR.low >= minL && currentHist > 0) {
          return createMatch('BULLISH', 'IMPULSE_BULL', finalIdx);
        }
      }
      // Check for 2-candle impulse (V2 > V1)
      else if (finalIdx - 3 >= 0 &&
        isGreen(finalIdx - 2) && isGreen(finalIdx - 3) &&
        candles[finalIdx - 2].volume > candles[finalIdx - 3].volume
      ) {
        const impulseLows = [candles[finalIdx - 2].low, candles[finalIdx - 3].low];
        const minL = Math.min(...impulseLows);
        if (pullbackR.low >= minL && currentHist > 0) {
          return createMatch('BULLISH', 'IMPULSE_BULL', finalIdx);
        }
      }
    }
  }

  // BEARISH Logic
  if (isRed(finalIdx) && isGreen(finalIdx - 1)) {
    const confirmR = candles[finalIdx];
    const pullbackG = candles[finalIdx - 1];

    if (confirmR.close < pullbackG.low) {
      // Check for 3-candle impulse (V3 > V2 > V1)
      if (finalIdx - 4 >= 0 &&
        isRed(finalIdx - 2) && isRed(finalIdx - 3) && isRed(finalIdx - 4) &&
        candles[finalIdx - 2].volume > candles[finalIdx - 3].volume &&
        candles[finalIdx - 3].volume > candles[finalIdx - 4].volume
      ) {
        const impulseHighs = [candles[finalIdx - 2].high, candles[finalIdx - 3].high, candles[finalIdx - 4].high];
        const maxH = Math.max(...impulseHighs);
        if (pullbackG.high <= maxH && currentHist < 0) {
          return createMatch('BEARISH', 'IMPULSE_BEAR', finalIdx);
        }
      }
      // Check for 2-candle impulse (V2 > V1)
      else if (finalIdx - 3 >= 0 &&
        isRed(finalIdx - 2) && isRed(finalIdx - 3) &&
        candles[finalIdx - 2].volume > candles[finalIdx - 3].volume
      ) {
        const impulseHighs = [candles[finalIdx - 2].high, candles[finalIdx - 3].high];
        const maxH = Math.max(...impulseHighs);
        if (pullbackG.high <= maxH && currentHist < 0) {
          return createMatch('BEARISH', 'IMPULSE_BEAR', finalIdx);
        }
      }
    }
  }

  return null;

  function createMatch(type: 'BULLISH' | 'BEARISH', signal: string, idx: number): StrategyMatch {
    const currentPrice = candles[bars - 1].close;
    return {
      symbol,
      price: currentPrice,
      timeframe,
      type,
      signal: signal as any,
      timestamp: candles[idx].time,
      entryPrice: candles[idx].close,
      stopLoss: type === 'BULLISH' ? candles[idx].low : candles[idx].high,
      takeProfit: type === 'BULLISH' ? currentPrice * 1.02 : currentPrice * 0.98,
    };
  }
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

import { Candle, StrategyMatch } from '../types';


//  Helper: MACD
// ─────────────────────────────────────────────────────────────────────────────
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(0);
  if (data.length === 0) return ema;

  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
    ema[i] = sum / (i + 1); // SMA for the initial period
  }

  for (let i = period; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

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

export function detectImpulseSignal(symbol: string, candles: Candle[], timeframe: string, offset = 1): StrategyMatch | null {
  const bars = candles.length;
  // Sequence needs: 2-3 Impulse + 1 Pullback + 1 Confirm = 4-5 candles.
  if (bars < 35) return null;

  const finalIdx = bars - 1 - offset; // The Confirmation Candle (must be closed)
  if (finalIdx < 6) return null;

  const isGreen = (i: number) => candles[i].close > candles[i].open;
  const isRed = (i: number) => candles[i].close < candles[i].open;

  const closes = candles.map(c => c.close);
  const macdHistArray = calculateMACDHistogram(closes);
  const currentMacdHist = macdHistArray[finalIdx];

  // BULLISH Logic
  if (isGreen(finalIdx) && isRed(finalIdx - 1)) {
    // Bullish signal will only be generated when MACD Histogram is positive
    if (currentMacdHist > 0) {
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
          if (pullbackR.low >= minL) {
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
          if (pullbackR.low >= minL) {
            return createMatch('BULLISH', 'IMPULSE_BULL', finalIdx);
          }
        }
      }
    }
  }

  // BEARISH Logic
  if (isRed(finalIdx) && isGreen(finalIdx - 1)) {
    // Bearish signal MACD validation (negative MACD hist)
    if (currentMacdHist < 0) {
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
          if (pullbackG.high <= maxH) {
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
          if (pullbackG.high <= maxH) {
            return createMatch('BEARISH', 'IMPULSE_BEAR', finalIdx);
          }
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


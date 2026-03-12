import { Candle, StrategyMatch } from '../types';

export function detectImpulseSignal(symbol: string, candles: Candle[], timeframe: string, offset = 1): StrategyMatch | null {
  const bars = candles.length;
  // Sequence needs: 2-3 Impulse + 1 Pullback + 1 Confirm = 4-5 candles.
  if (bars < 35) return null;

  const finalIdx = bars - 1 - offset; // The Confirmation Candle (must be closed)
  if (finalIdx < 6) return null;

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

import { FVG } from '../types';

/**
 * Scans 1H (or any HTF) for FVGs and tracks mitigation status.
 * Returns only the unmitigated FVGs.
 */
export function detectFVGs(candles: Candle[]): FVG[] {
  const fvgs: FVG[] = [];
  if (candles.length < 3) return fvgs;

  // 1. Detect all FVGs in the history
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG: C3 Low > C1 High
    if (c3.low > c1.high) {
      fvgs.push({
        type: 'BULLISH',
        lower: c1.high, // Bottom of the gap
        upper: c3.low,  // Top of the gap
        timestamp: candles[i - 1].time, // The middle candle
        mitigated: false
      });
    }
    // Bearish FVG: C3 High < C1 Low
    else if (c3.high < c1.low) {
      fvgs.push({
        type: 'BEARISH',
        lower: c3.high, // Bottom of the gap
        upper: c1.low,  // Top of the gap
        timestamp: candles[i - 1].time, // The middle candle
        mitigated: false
      });
    }
  }

  // 2. Mark mitigated FVGs
  for (const gap of fvgs) {
    const startIndex = candles.findIndex(c => c.time === gap.timestamp) + 2;
    if (startIndex < 2 || startIndex >= candles.length) continue;

    for (let j = startIndex; j < candles.length; j++) {
      const c = candles[j];
      if (gap.type === 'BULLISH') {
        // Did price test the lower boundary?
        if (c.low <= gap.lower) { gap.mitigated = true; break; }
      } else {
        // Did price test the upper boundary?
        if (c.high >= gap.upper) { gap.mitigated = true; break; }
      }
    }
  }

  // 3. Return only unmitigated
  return fvgs.filter(f => !f.mitigated);
}

/**
 * Monitors the 5M chart for interaction with unmitigated HTF FVGs.
 * Requires price to enter the FVG zone and show a reaction (rejection).
 */
export function detectFVGSignal(
  symbol: string,
  ltfCandles: Candle[],
  htfFVGs: FVG[],
  timeframe: string
): StrategyMatch | null {
  if (ltfCandles.length < 2 || htfFVGs.length === 0) return null;

  // Check the most recently closed LTF candle
  const current = ltfCandles[ltfCandles.length - 2];
  // Optionally, you can also check the very live candle: `ltfCandles[ltfCandles.length - 1]` 
  // if you want immediate live signals inside the gap, but the user usually prefers standard confirmation.
  // We'll use the most recently closed one for firmness:
  const checkCandle = ltfCandles[ltfCandles.length - 2];

  // Actually, standard live signals would use the newest closed candle
  const closedCandle = ltfCandles[ltfCandles.length - 1]; // Let's use closed index like the impulse uses offset=1 usually. But impulse uses length-2 for 'finalIdx' with offset=1. 
  const finalIdx = ltfCandles.length - 2;
  if (finalIdx < 0) return null;
  const c = ltfCandles[finalIdx];

  for (const fvg of htfFVGs) {
    if (fvg.type === 'BULLISH') {
      // Enter the gap: low must be below the upper line, but above the lower
      const entered = c.low <= fvg.upper && c.low >= fvg.lower;
      // Reaction: Close is higher than open (green candle) OR long lower wick
      const reaction = c.close > c.open;

      if (entered && reaction) {
        return {
          symbol,
          price: c.close,
          timeframe,
          type: 'BULLISH',
          signal: 'FVG_BULL',
          timestamp: c.time,
          entryPrice: c.close,
          stopLoss: fvg.lower,
          takeProfit: c.close + ((c.close - fvg.lower) * 2), // 1:2 R:R
          fvg
        };
      }
    } else {
      // BEARISH FVG
      const entered = c.high >= fvg.lower && c.high <= fvg.upper;
      const reaction = c.close < c.open; // red candle

      if (entered && reaction) {
        return {
          symbol,
          price: c.close,
          timeframe,
          type: 'BEARISH',
          signal: 'FVG_BEAR',
          timestamp: c.time,
          entryPrice: c.close,
          stopLoss: fvg.upper,
          takeProfit: c.close - ((fvg.upper - c.close) * 2), // 1:2 R:R
          fvg
        };
      }
    }
  }

  return null;
}




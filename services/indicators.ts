
import { Candle, StrategyMatch } from '../types';

function calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    if (data.length === 0) return [];
    const emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
}

export function checkMomentumStrategy(symbol: string, candles: Candle[], timeframe: string): StrategyMatch | null {
    // Need at least 50 candles for stable MACD
    if (candles.length < 50) return null;

    const closes = candles.map(c => c.close);
    const len = candles.length;

    // --- MACD Calculation (12, 26, 9) ---
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);

    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = calculateEMA(macdLine, 9);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);

    const currentIdx = len - 1;

    // MACD Confirmation: MACD > 0 and Histogram > 0
    // Note: This implicitly covers "MACD crosses signal line" invalidation.
    // If MACD crosses below signal, histogram becomes negative => returns null.
    if (macdLine[currentIdx] <= 0 || histogram[currentIdx] <= 0) {
        return null;
    }

    // --- Pattern Identification ---

    // Helpers
    const c = (i: number) => candles[i];
    const isGreen = (i: number) => c(i).close > c(i).open;
    const isRed = (i: number) => c(i).close < c(i).open;
    const bodySize = (i: number) => Math.abs(c(i).close - c(i).open);
    // Small body condition (consolidation): < 0.3% movement
    const isSmall = (i: number) => bodySize(i) < (c(i).open * 0.003);

    // 1. Identify Pullback (Current Action)
    // We look for 1 or 2 candles that are Red or Small Body (Consolidation)
    let pullbackCount = 0;
    let impulseEndIdx = -1;

    if (isRed(currentIdx) || isSmall(currentIdx)) {
        // Check if this is a 1-candle pullback preceded by Impulse
        if (isGreen(currentIdx - 1) && !isSmall(currentIdx - 1)) {
            pullbackCount = 1;
            impulseEndIdx = currentIdx - 1;
        }
        // Check if this is a 2-candle pullback
        else if (isRed(currentIdx - 1) || isSmall(currentIdx - 1)) {
            if (isGreen(currentIdx - 2) && !isSmall(currentIdx - 2)) {
                pullbackCount = 2;
                impulseEndIdx = currentIdx - 2;
            }
        }
    }

    if (pullbackCount === 0) return null;

    // 2. Identify Bullish Impulse
    // Preceding the pullback, we need 2 or 3 consecutive bullish candles
    // with higher closes.

    let impulseCount = 0;
    let curr = impulseEndIdx;

    const impulseIndices = [];
    while (curr >= 0 && impulseCount < 3) {
        if (isGreen(curr)) {
            if (impulseIndices.length > 0) {
                // Ensure close is higher than previous candle's close (momentum)
                if (c(curr).close >= c(curr + 1).close) break;
            }
            impulseIndices.push(curr);
            impulseCount++;
            curr--;
        } else {
            break;
        }
    }

    if (impulseCount < 2) return null;

    const firstImpulseIdx = impulseEndIdx - impulseCount + 1;

    // --- Invalidation Rules ---

    // 1. Structure Invalidation
    // "Pullback should not break below the low of the first impulse candle."
    const impulseLow = c(firstImpulseIdx).low;
    for (let k = 0; k < pullbackCount; k++) {
        const pIdx = currentIdx - k;
        if (c(pIdx).low < impulseLow) return null;
    }

    // 2. Momentum Strength Invalidation (Body Size)
    // "Reduced momentum compared to bullish impulse"
    let totalImpulseBody = 0;
    for (let k = firstImpulseIdx; k <= impulseEndIdx; k++) totalImpulseBody += bodySize(k);
    const avgImpulseBody = totalImpulseBody / impulseCount;

    let totalPullbackBody = 0;
    for (let k = 0; k < pullbackCount; k++) totalPullbackBody += bodySize(currentIdx - k);
    const avgPullbackBody = totalPullbackBody / pullbackCount;

    // Pullback bodies should be smaller (0.9 factor tolerance)
    if (avgPullbackBody > avgImpulseBody * 0.9) return null;

    // 3. Volume Invalidation & Confirmation
    // Calculate Avg Volumes of the preceding candles (baseline)
    const baselinePeriod = 20;
    const baselineStart = Math.max(0, firstImpulseIdx - baselinePeriod);
    let totalBaselineVol = 0;
    let baselineCount = 0;
    for (let k = baselineStart; k < firstImpulseIdx; k++) {
        totalBaselineVol += c(k).volume;
        baselineCount++;
    }
    const avgBaselineVol = baselineCount > 0 ? totalBaselineVol / baselineCount : 0;

    // Rule: Impulse volume should ideally be higher than baseline (Volume Spike)
    const lastImpulseVol = c(impulseEndIdx).volume;
    const isVolumeSpike = avgBaselineVol > 0 && lastImpulseVol > avgBaselineVol * 1.5;

    let totalImpulseVol = 0;
    for (let k = firstImpulseIdx; k <= impulseEndIdx; k++) totalImpulseVol += c(k).volume;
    const avgImpulseVol = totalImpulseVol / impulseCount;

    let totalPullbackVol = 0;
    for (let k = 0; k < pullbackCount; k++) totalPullbackVol += c(currentIdx - k).volume;
    const avgPullbackVol = totalPullbackVol / pullbackCount;

    // Rule: Invalidate if Pullback Volume is significantly higher than Impulse Volume (Supply Entering)
    if (avgPullbackVol > avgImpulseVol) return null;

    // Rule: Invalidate if Impulse Volume is rapidly decreasing (Exhaustion)
    if (c(impulseEndIdx).volume < c(firstImpulseIdx).volume * 0.6) return null;

    // 4. Jackknife Rejection (Wick Invalidation)
    // Check the last impulse candle and all pullback candles for large upper wicks (rejection from highs)
    const checkIndices = [impulseEndIdx];
    for (let k = 0; k < pullbackCount; k++) checkIndices.push(currentIdx - k);

    for (const idx of checkIndices) {
        const k = c(idx);
        const body = Math.abs(k.close - k.open);
        const upperWick = k.high - Math.max(k.close, k.open);
        const range = k.high - k.low;

        // Jackknife definition: 
        // 1. Upper wick is > 50% of the total candle range
        // 2. Upper wick is > 1.2x the body size (clear rejection shape)
        if (range > 0 && upperWick > range * 0.5 && upperWick > body * 1.2) {
            return null;
        }
    }

    return {
        symbol,
        price: c(currentIdx).close,
        timeframe,
        type: 'BULLISH',
        signal: impulseCount === 3 ? '3_CANDLE_IMPULSE' : '2_CANDLE_IMPULSE',
        pullbackCount,
        timestamp: Date.now(),
        macd: {
            value: macdLine[currentIdx],
            histogram: histogram[currentIdx]
        },
        volumeSpike: isVolumeSpike
    };
}

export function checkBearishMomentumStrategy(symbol: string, candles: Candle[], timeframe: string): StrategyMatch | null {
    // Need at least 50 candles for stable MACD
    if (candles.length < 50) return null;

    const closes = candles.map(c => c.close);
    const len = candles.length;

    // --- MACD Calculation (12, 26, 9) ---
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);

    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = calculateEMA(macdLine, 9);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);

    const currentIdx = len - 1;

    // Bearish MACD Confirmation: MACD < 0 and Histogram < 0
    if (macdLine[currentIdx] >= 0 || histogram[currentIdx] >= 0) {
        return null;
    }

    // --- Pattern Identification ---

    // Helpers
    const c = (i: number) => candles[i];
    const isGreen = (i: number) => c(i).close > c(i).open;
    const isRed = (i: number) => c(i).close < c(i).open;
    const bodySize = (i: number) => Math.abs(c(i).close - c(i).open);
    // Small body condition (consolidation): < 0.3% movement
    const isSmall = (i: number) => bodySize(i) < (c(i).open * 0.003);

    // 1. Identify Pullback (Current Action)
    // We look for 1 or 2 candles that are Green or Small Body (Consolidation)
    let pullbackCount = 0;
    let impulseEndIdx = -1;

    if (isGreen(currentIdx) || isSmall(currentIdx)) {
        // Check if this is a 1-candle pullback preceded by Impulse
        if (isRed(currentIdx - 1) && !isSmall(currentIdx - 1)) {
            pullbackCount = 1;
            impulseEndIdx = currentIdx - 1;
        }
        // Check if this is a 2-candle pullback
        else if (isGreen(currentIdx - 1) || isSmall(currentIdx - 1)) {
            if (isRed(currentIdx - 2) && !isSmall(currentIdx - 2)) {
                pullbackCount = 2;
                impulseEndIdx = currentIdx - 2;
            }
        }
    }

    if (pullbackCount === 0) return null;

    // 2. Identify Bearish Impulse
    // Preceding the pullback, we need 2 or 3 consecutive bearish candles
    // with lower closes.

    let impulseCount = 0;
    let curr = impulseEndIdx;

    const impulseIndices = [];
    while (curr >= 0 && impulseCount < 3) {
        if (isRed(curr)) {
            if (impulseIndices.length > 0) {
                // Ensure close is lower than previous candle's close (momentum)
                if (c(curr).close <= c(curr + 1).close) break;
            }
            impulseIndices.push(curr);
            impulseCount++;
            curr--;
        } else {
            break;
        }
    }

    if (impulseCount < 2) return null;

    const firstImpulseIdx = impulseEndIdx - impulseCount + 1;

    // --- Invalidation Rules ---

    // 1. Structure Invalidation
    // "Pullback should not break above the high of the first impulse candle."
    const impulseHigh = c(firstImpulseIdx).high;
    for (let k = 0; k < pullbackCount; k++) {
        const pIdx = currentIdx - k;
        if (c(pIdx).high > impulseHigh) return null;
    }

    // 2. Momentum Strength Invalidation (Body Size)
    // "Reduced momentum compared to bearish impulse"
    let totalImpulseBody = 0;
    for (let k = firstImpulseIdx; k <= impulseEndIdx; k++) totalImpulseBody += bodySize(k);
    const avgImpulseBody = totalImpulseBody / impulseCount;

    let totalPullbackBody = 0;
    for (let k = 0; k < pullbackCount; k++) totalPullbackBody += bodySize(currentIdx - k);
    const avgPullbackBody = totalPullbackBody / pullbackCount;

    // Pullback bodies should be smaller (0.9 factor tolerance)
    if (avgPullbackBody > avgImpulseBody * 0.9) return null;

    // 3. Volume Invalidation
    let totalImpulseVol = 0;
    for (let k = firstImpulseIdx; k <= impulseEndIdx; k++) totalImpulseVol += c(k).volume;
    const avgImpulseVol = totalImpulseVol / impulseCount;

    let totalPullbackVol = 0;
    for (let k = 0; k < pullbackCount; k++) totalPullbackVol += c(currentIdx - k).volume;
    const avgPullbackVol = totalPullbackVol / pullbackCount;

    // Rule: Invalidate if Pullback Volume is significantly higher than Impulse Volume (Demand Entering)
    if (avgPullbackVol > avgImpulseVol) return null;

    // Rule: Invalidate if Impulse Volume is rapidly decreasing (Exhaustion)
    if (c(impulseEndIdx).volume < c(firstImpulseIdx).volume * 0.6) return null;

    // 4. Jackknife Rejection (Wick Invalidation)
    // Check the last impulse candle and all pullback candles for large lower wicks (rejection from lows)
    const checkIndices = [impulseEndIdx];
    for (let k = 0; k < pullbackCount; k++) checkIndices.push(currentIdx - k);

    for (const idx of checkIndices) {
        const k = c(idx);
        const body = Math.abs(k.close - k.open);
        const lowerWick = Math.min(k.close, k.open) - k.low;
        const range = k.high - k.low;

        // Jackknife definition for Bearish: 
        // 1. Lower wick is > 50% of the total candle range
        // 2. Lower wick is > 1.2x the body size (clear rejection shape)
        if (range > 0 && lowerWick > range * 0.5 && lowerWick > body * 1.2) {
            return null;
        }
    }

    return {
        symbol,
        price: c(currentIdx).close,
        timeframe,
        type: 'BEARISH',
        signal: impulseCount === 3 ? '3_CANDLE_IMPULSE' : '2_CANDLE_IMPULSE',
        pullbackCount,
        timestamp: Date.now(),
        macd: {
            value: macdLine[currentIdx],
            histogram: histogram[currentIdx]
        }
    };
}

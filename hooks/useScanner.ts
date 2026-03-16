import React, { useState, useEffect, useRef } from 'react';
import { StrategyMatch, Candle } from '../types';
import { fetchKlinesBatch, getRateLimitStatus, subscribeKlines, getCachedCandles } from '../services/binanceService';
import { detectImpulseSignal, detectMidSignal, detectSwingSignal, computeTrendBias } from '../services/indicators';

export const useScanner = (scanUniverse: string[]) => {
    const [bull1m, setBull1m] = useState<StrategyMatch[]>([]);
    const [bear1m, setBear1m] = useState<StrategyMatch[]>([]);
    const [bull5m, setBull5m] = useState<StrategyMatch[]>([]);
    const [bear5m, setBear5m] = useState<StrategyMatch[]>([]);
    const [bull15m, setBull15m] = useState<StrategyMatch[]>([]);
    const [bear15m, setBear15m] = useState<StrategyMatch[]>([]);
    const [bull30m, setBull30m] = useState<StrategyMatch[]>([]);
    const [bear30m, setBear30m] = useState<StrategyMatch[]>([]);
    const [bull1h, setBull1h] = useState<StrategyMatch[]>([]);
    const [bear1h, setBear1h] = useState<StrategyMatch[]>([]);
    const [bull4h, setBull4h] = useState<StrategyMatch[]>([]);
    const [bear4h, setBear4h] = useState<StrategyMatch[]>([]);
    const [totalScanned, setTotalScanned] = useState(0);
    const [scanStatus, setScanStatus] = useState<string>('Initializing…');
    const [weightInfo, setWeightInfo] = useState({ used: 0, pct: 0 });

    const scalpIndexRef = useRef(0);
    const midIndexRef = useRef(0);
    const swingIndexRef = useRef(0);
    const isScalpRunningRef = useRef(false);
    const isMidRunningRef = useRef(false);
    const isSwingRunningRef = useRef(false);
    const symbolsRef = useRef<string[]>([]);

    const lastCheckedRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        symbolsRef.current = scanUniverse;
    }, [scanUniverse]);

    const updateMatchesStably = (
        setter: React.Dispatch<React.SetStateAction<StrategyMatch[]>>,
        match: StrategyMatch,
        symbol: string
    ) => {
        setter(prev => {
            const existingIdx = prev.findIndex(m => m.symbol === symbol);

            if (existingIdx === -1) {
                return [match, ...prev].slice(0, 100);
            } else {
                if (match.timestamp > prev[existingIdx].timestamp) {
                    const filtered = prev.filter(m => m.symbol !== symbol);
                    return [match, ...filtered].slice(0, 100);
                } else if (match.timestamp === prev[existingIdx].timestamp) {
                    if (prev[existingIdx].price === match.price) return prev;
                    const updated = [...prev];
                    updated[existingIdx] = match;
                    return updated;
                }
                return prev;
            }
        });
    };

    const processSignal = (
        finalMatch: StrategyMatch | null,
        symbol: string,
        tf: string
    ) => {
        if (!finalMatch) return;

        let setterBull: any, setterBear: any;
        if (tf === '1m') { setterBull = setBull1m; setterBear = setBear1m; }
        else if (tf === '5m') { setterBull = setBull5m; setterBear = setBear5m; }
        else if (tf === '15m') { setterBull = setBull15m; setterBear = setBear15m; }
        else if (tf === '30m') { setterBull = setBull30m; setterBear = setBear30m; }
        else if (tf === '1h') { setterBull = setBull1h; setterBear = setBear1h; }
        else if (tf === '4h') { setterBull = setBull4h; setterBear = setBear4h; }

        if (finalMatch.type === 'BULLISH') {
            updateMatchesStably(setterBull, finalMatch, symbol);
            setterBear((prev: StrategyMatch[]) => prev.filter(m => m.symbol !== symbol));
        } else {
            updateMatchesStably(setterBear, finalMatch, symbol);
            setterBull((prev: StrategyMatch[]) => prev.filter(m => m.symbol !== symbol));
        }
    };

    const shouldAnalyze = (symbol: string, tf: string, candles: Candle[]): boolean => {
        if (candles.length < 2) return false;
        const lastClosed = candles[candles.length - 2];
        const key = `${symbol}-${tf}`;
        const prev = lastCheckedRef.current.get(key);
        if (prev === lastClosed.time) return false;
        lastCheckedRef.current.set(key, lastClosed.time);
        return true;
    };

    // Helper: get HTF trend bias from cached candles (no API call)
    const getHTFBias = (symbol: string, htfInterval: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | undefined => {
        const cached = getCachedCandles(symbol, htfInterval);
        if (!cached || cached.length < 55) return undefined; // No data yet, skip HTF filter
        return computeTrendBias(cached);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FAST LOOP: 1m Scalp Scanner
    // HTF confirmation: uses cached 15m trend bias
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (scanUniverse.length === 0 || isScalpRunningRef.current) return;
        isScalpRunningRef.current = true;

        const BATCH = 30;

        const scanScalp = async () => {
            if (!isScalpRunningRef.current) return;

            const universe = symbolsRef.current;
            if (universe.length === 0) {
                setTimeout(scanScalp, 2000);
                return;
            }

            const rl = getRateLimitStatus();
            setWeightInfo({ used: rl.usedWeight, pct: rl.weightPct });

            if (rl.isLimited) {
                const secs = Math.ceil((rl.resetTime - Date.now()) / 1000);
                setScanStatus(`⏸ ${rl.type} – ${secs}s`);
                setTimeout(scanScalp, 5000);
                return;
            }

            const idx = scalpIndexRef.current % universe.length;
            const batch = universe.slice(idx, idx + BATCH);
            if (batch.length < BATCH && universe.length > BATCH) {
                batch.push(...universe.slice(0, BATCH - batch.length));
            }

            setScanStatus(`⚡ ${batch.slice(0, 3).join(', ')}…`);

            try {
                const batchData = await fetchKlinesBatch(batch, '1m', 120);

                batch.forEach(symbol => {
                    const candles = batchData[symbol] || [];
                    if (candles.length < 55) return;
                    if (!shouldAnalyze(symbol, '1m', candles)) return;

                    // HTF: check 15m trend bias from cache
                    const htfBias = getHTFBias(symbol, '15m');
                    const match = detectImpulseSignal(symbol, candles, '1m', 1, htfBias);
                    processSignal(match, symbol, '1m');
                });
            } catch (_) { }

            setTotalScanned(prev => prev + batch.length);
            scalpIndexRef.current = (idx + batch.length) % universe.length;

            // Freq: ~1 batch per second = ~30 req/min (very lightweight)
            setTimeout(scanScalp, 1000);
        };

        scanScalp();
        return () => { isScalpRunningRef.current = false; };
    }, [scanUniverse.length > 0]);

    // ═══════════════════════════════════════════════════════════════════════════
    // MID LOOP: 5m/15m/30m Scanner
    // HTF confirmation: uses cached 1h trend bias
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (scanUniverse.length === 0 || isMidRunningRef.current) return;
        isMidRunningRef.current = true;

        const BATCH = 40;

        const scanMid = async () => {
            if (!isMidRunningRef.current) return;

            const universe = symbolsRef.current;
            if (universe.length === 0) {
                setTimeout(scanMid, 3000);
                return;
            }

            const rl = getRateLimitStatus();
            if (rl.isLimited) {
                setTimeout(scanMid, 8000);
                return;
            }

            const idx = midIndexRef.current % universe.length;
            const batch = universe.slice(idx, idx + BATCH);
            if (batch.length < BATCH && universe.length > BATCH) {
                batch.push(...universe.slice(0, BATCH - batch.length));
            }

            subscribeKlines(batch, ['1m', '5m', '15m', '30m', '1h', '4h']);

            try {
                // Sequential processing of timeframes to avoid bursts
                for (const tf of ['5m', '15m', '30m']) {
                    const batchData = await fetchKlinesBatch(batch, tf, 120);

                    batch.forEach(symbol => {
                        const candles = batchData[symbol] || [];
                        if (candles.length < 55) return;
                        if (!shouldAnalyze(symbol, tf, candles)) return;

                        const htfBias = getHTFBias(symbol, '1h');
                        const match = detectMidSignal(symbol, candles, tf, 1, htfBias);
                        processSignal(match, symbol, tf);
                    });

                    // Stagger between timeframes
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (_) { }

            midIndexRef.current = (idx + batch.length) % universe.length;

            // Freq: Every 15s = ~8 batches/min = ~240 symbols/min
            setTimeout(scanMid, 15_000);
        };

        setTimeout(scanMid, 1500);
        return () => { isMidRunningRef.current = false; };
    }, [scanUniverse.length > 0]);

    // ═══════════════════════════════════════════════════════════════════════════
    // SLOW LOOP: 1h/4h Swing Scanner
    // HTF confirmation: 1h uses cached 4h bias; 4h is highest TF (no HTF)
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (scanUniverse.length === 0 || isSwingRunningRef.current) return;
        isSwingRunningRef.current = true;

        const BATCH = 50;

        const scanSwing = async () => {
            if (!isSwingRunningRef.current) return;

            const universe = symbolsRef.current;
            if (universe.length === 0) {
                setTimeout(scanSwing, 5000);
                return;
            }

            const rl = getRateLimitStatus();
            if (rl.isLimited) {
                setTimeout(scanSwing, 10000);
                return;
            }

            const idx = swingIndexRef.current % universe.length;
            const batch = universe.slice(idx, idx + BATCH);
            if (batch.length < BATCH && universe.length > BATCH) {
                batch.push(...universe.slice(0, BATCH - batch.length));
            }

            subscribeKlines(batch, ['1m', '5m', '15m', '30m', '1h', '4h']);

            try {
                for (const tf of ['1h', '4h']) {
                    const batchData = await fetchKlinesBatch(batch, tf, 250);

                    batch.forEach(symbol => {
                        const candles = batchData[symbol] || [];
                        if (candles.length < 210) return;
                        if (!shouldAnalyze(symbol, tf, candles)) return;

                        const htfBias = tf === '1h' ? getHTFBias(symbol, '4h') : undefined;
                        const match = detectSwingSignal(symbol, candles, tf, 1, htfBias);
                        processSignal(match, symbol, tf);
                    });
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (_) { }

            swingIndexRef.current = (idx + batch.length) % universe.length;

            // Freq: Every 30s
            setTimeout(scanSwing, 30_000);
        };

        setTimeout(scanSwing, 3000);
        return () => { isSwingRunningRef.current = false; };
    }, [scanUniverse.length > 0]);

    return {
        bull1m, bear1m,
        bull5m, bear5m, bull15m, bear15m, bull30m, bear30m,
        bull1h, bear1h, bull4h, bear4h,
        totalScanned, scanStatus, weightInfo
    };
};

import React, { useState, useEffect, useRef } from 'react';
import { StrategyMatch, Candle } from '../types';
import { fetchKlinesBatch, getRateLimitStatus, subscribeKlines } from '../services/binanceService';
import { detectImpulseSignal, detectSwingSignal } from '../services/indicators';

export const useScanner = (scanUniverse: string[]) => {
    const [bull1m, setBull1m] = useState<StrategyMatch[]>([]);
    const [bear1m, setBear1m] = useState<StrategyMatch[]>([]);
    const [bull1h, setBull1h] = useState<StrategyMatch[]>([]);
    const [bear1h, setBear1h] = useState<StrategyMatch[]>([]);
    const [bull4h, setBull4h] = useState<StrategyMatch[]>([]);
    const [bear4h, setBear4h] = useState<StrategyMatch[]>([]);
    const [totalScanned, setTotalScanned] = useState(0);
    const [scanStatus, setScanStatus] = useState<string>('Initializing…');
    const [weightInfo, setWeightInfo] = useState({ used: 0, pct: 0 });

    const scalpIndexRef = useRef(0);
    const swingIndexRef = useRef(0);
    const isScalpRunningRef = useRef(false);
    const isSwingRunningRef = useRef(false);
    const symbolsRef = useRef<string[]>([]);

    // Track last checked candle timestamp per symbol/tf to avoid redundant analysis
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

    // Check if a candle has already been analyzed (skip if same candle)
    const shouldAnalyze = (symbol: string, tf: string, candles: Candle[]): boolean => {
        if (candles.length < 2) return false;
        const lastClosed = candles[candles.length - 2]; // offset=1 candle
        const key = `${symbol}-${tf}`;
        const prev = lastCheckedRef.current.get(key);
        if (prev === lastClosed.time) return false; // Same candle, skip
        lastCheckedRef.current.set(key, lastClosed.time);
        return true;
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FAST LOOP: 1m Scalp Scanner (batch=30, 50ms delay)
    // Runs continuously to catch every 1m candle close
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

                    const match = detectImpulseSignal(symbol, candles, '1m', 1);
                    processSignal(match, symbol, '1m');
                });
            } catch (_) { }

            setTotalScanned(prev => prev + batch.length);
            scalpIndexRef.current = (idx + batch.length) % universe.length;

            setTimeout(scanScalp, 50);
        };

        scanScalp();
        return () => { isScalpRunningRef.current = false; };
    }, [scanUniverse.length > 0]);

    // ═══════════════════════════════════════════════════════════════════════════
    // SLOW LOOP: 1h/4h Swing Scanner (batch=50, 10s delay)
    // Runs at a relaxed pace since higher TF candles change slowly
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

            // Subscribe this batch to WebSockets for all timeframes
            subscribeKlines(batch, ['1m', '1h', '4h']);

            try {
                // Process 1h and 4h in parallel
                await Promise.all(['1h', '4h'].map(async (tf) => {
                    const batchData = await fetchKlinesBatch(batch, tf, 250);

                    batch.forEach(symbol => {
                        const candles = batchData[symbol] || [];
                        if (candles.length < 210) return;
                        if (!shouldAnalyze(symbol, tf, candles)) return;

                        const match = detectSwingSignal(symbol, candles, tf, 1);
                        processSignal(match, symbol, tf);
                    });
                }));
            } catch (_) { }

            swingIndexRef.current = (idx + batch.length) % universe.length;

            // 10s delay — 1h/4h candles don't close often, no need to rush
            setTimeout(scanSwing, 10_000);
        };

        // Delay swing start by 3s so the fast loop gets priority on initial API calls
        setTimeout(scanSwing, 3000);
        return () => { isSwingRunningRef.current = false; };
    }, [scanUniverse.length > 0]);

    return {
        bull1m, bear1m, bull1h, bear1h, bull4h, bear4h,
        totalScanned, scanStatus, weightInfo
    };
};


import React, { useState, useEffect, useRef } from 'react';
import { StrategyMatch, Candle } from '../types';
import { fetchKlinesBatch, getRateLimitStatus, subscribeKlines } from '../services/binanceService';
import { detectImpulseSignal, detectParabolicSignal } from '../services/indicators';

export const useScanner = (scanUniverse: string[]) => {
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

    const scanIndexRef = useRef(0);
    const isScanningRef = useRef(false);
    const symbolsRef = useRef<string[]>([]);

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
                // New coin, new signal
                return [match, ...prev].slice(0, 100);
            } else {
                // Same coin. Check if this is a newer candle or just a price update.
                if (match.timestamp > prev[existingIdx].timestamp) {
                    // Newer candle: replace and move to top
                    const filtered = prev.filter(m => m.symbol !== symbol);
                    return [match, ...filtered].slice(0, 100);
                } else if (match.timestamp === prev[existingIdx].timestamp) {
                    // Same candle: update current price and return
                    if (prev[existingIdx].price === match.price) return prev;
                    const updated = [...prev];
                    updated[existingIdx] = match;
                    return updated;
                }
                // Older signal: ignore
                return prev;
            }
        });
    };

    useEffect(() => {
        if (scanUniverse.length === 0 || isScanningRef.current) return;
        isScanningRef.current = true;

        const scanNext = async () => {
            if (!isScanningRef.current) return;

            const currentUniverse = symbolsRef.current;
            if (currentUniverse.length === 0) {
                setTimeout(scanNext, 2000);
                return;
            }

            const rl = getRateLimitStatus();
            setWeightInfo({ used: rl.usedWeight, pct: rl.weightPct });

            if (rl.isLimited) {
                const secs = Math.ceil((rl.resetTime - Date.now()) / 1000);
                setScanStatus(`⏸ ${rl.type} – ${secs}s`);
                setTimeout(scanNext, 5000);
                return;
            }

            const idx = scanIndexRef.current % currentUniverse.length;
            const BATCH_SIZE = 20;
            const batch = currentUniverse.slice(idx, idx + BATCH_SIZE);
            if (batch.length < BATCH_SIZE && currentUniverse.length > BATCH_SIZE) {
                // Wrap around to get a full batch if near the end
                batch.push(...currentUniverse.slice(0, BATCH_SIZE - batch.length));
            }

            // Proactively subscribe to WebSockets for this batch to keep cache warm (0 weight REST calls)
            subscribeKlines(batch, ['15m', '30m', '1h', '4h']);

            // Display up to 3 coins to prevent the UI from looking stuck on just 1
            setScanStatus(batch.slice(0, 3).join(', ') + '…');

            // Parallelize scanning of multiple timeframes across the whole batch
            const tfs = ['15m', '30m', '1h', '4h'];
            await Promise.all(tfs.map(async (tf) => {
                const batchData = await fetchKlinesBatch(batch, tf, 120);

                // Process results for this timeframe
                batch.forEach(symbol => {
                    const candles = batchData[symbol] || [];
                    if (candles.length < 25) return;

                    // Check for both Impulse and Parabolic signals on the most recent closed candle (offset 1)
                    const impulseMatch = detectImpulseSignal(symbol, candles, tf, 1);
                    const parabolicMatch = detectParabolicSignal(symbol, candles, tf, 1);

                    const finalMatch = impulseMatch || parabolicMatch;

                    if (finalMatch) {
                        // Map setter based on TF
                        let setterBull: any, setterBear: any;
                        if (tf === '15m') { setterBull = setBull15m; setterBear = setBear15m; }
                        else if (tf === '30m') { setterBull = setBull30m; setterBear = setBear30m; }
                        else if (tf === '1h') { setterBull = setBull1h; setterBear = setBear1h; }
                        else if (tf === '4h') { setterBull = setBull4h; setterBear = setBear4h; }

                        if (finalMatch.type === 'BULLISH') {
                            updateMatchesStably(setterBull, finalMatch, symbol);
                            // Ensure any stale BEAR signal for this symbol is cleared
                            setterBear((prev: StrategyMatch[]) => prev.filter(m => m.symbol !== symbol));
                        } else {
                            updateMatchesStably(setterBear, finalMatch, symbol);
                            // Ensure any stale BULL signal for this symbol is cleared
                            setterBull((prev: StrategyMatch[]) => prev.filter(m => m.symbol !== symbol));
                        }
                    }
                });
            }));

            setTotalScanned(prev => prev + batch.length);
            scanIndexRef.current = (idx + batch.length) % currentUniverse.length;

            // Yield to UI thread with minimal delay for high-frequency updates
            setTimeout(scanNext, 50);
        };

        scanNext();
        return () => { isScanningRef.current = false; };
    }, [scanUniverse.length > 0]);

    return {
        bull15m, bear15m, bull30m, bear30m,
        bull1h, bear1h, bull4h, bear4h,
        totalScanned, scanStatus, weightInfo
    };
};

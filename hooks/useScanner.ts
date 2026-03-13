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
            subscribeKlines(batch, ['1m', '1h', '4h']);

            // Display up to 3 coins to prevent the UI from looking stuck on just 1
            setScanStatus(batch.slice(0, 3).join(', ') + '…');

            // Parallelize scanning of multiple timeframes across the whole batch
            const tfs = ['1m', '1h', '4h'];
            await Promise.all(tfs.map(async (tf) => {
                const isSwing = tf === '1h' || tf === '4h';
                const limit = isSwing ? 250 : 120;
                const batchData = await fetchKlinesBatch(batch, tf, limit);

                // Process results for this timeframe
                batch.forEach(symbol => {
                    const candles = batchData[symbol] || [];
                    if (candles.length < (isSwing ? 210 : 25)) return;

                    // Use the appropriate detector per timeframe
                    const finalMatch = isSwing
                        ? detectSwingSignal(symbol, candles, tf, 1)
                        : detectImpulseSignal(symbol, candles, tf, 1);

                    if (finalMatch) {
                        // Map setter based on TF
                        let setterBull: any, setterBear: any;
                        if (tf === '1m') { setterBull = setBull1m; setterBear = setBear1m; }
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
        bull1m, bear1m, bull1h, bear1h, bull4h, bear4h,
        totalScanned, scanStatus, weightInfo
    };
};

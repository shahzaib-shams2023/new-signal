
import React, { useState, useEffect, useRef } from 'react';
import { StrategyMatch, Candle } from '../types';
import { fetchKlines, getRateLimitStatus } from '../services/binanceService';
import { checkEMACross } from '../services/indicators';

export const useScanner = (scanUniverse: string[]) => {
    const [bull5m, setBull5m] = useState<StrategyMatch[]>([]);
    const [bear5m, setBear5m] = useState<StrategyMatch[]>([]);
    const [bull15m, setBull15m] = useState<StrategyMatch[]>([]);
    const [bear15m, setBear15m] = useState<StrategyMatch[]>([]);
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
        match: StrategyMatch | null,
        symbol: string,
        signalId: string
    ) => {
        setter(prev => {
            const existing = prev.find(m => m.symbol === symbol && m.signal === signalId);
            if (!existing && !match) return prev;
            if (!existing && match) return [match, ...prev];
            if (existing && !match) return prev.filter(m => !(m.symbol === symbol && m.signal === signalId));
            if (existing && match) {
                if (existing.timestamp === match.timestamp && existing.price === match.price) return prev;
                return prev.map(m => (m.symbol === symbol && m.signal === signalId) ? match : m);
            }
            return prev;
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
            const BATCH_SIZE = 10;
            const batch = currentUniverse.slice(idx, idx + BATCH_SIZE);
            if (batch.length < BATCH_SIZE && currentUniverse.length > BATCH_SIZE) {
                // Wrap around to get a full batch if near the end
                batch.push(...currentUniverse.slice(0, BATCH_SIZE - batch.length));
            }

            // Display up to 3 coins to prevent the UI from looking stuck on just 1
            setScanStatus(batch.slice(0, 3).join(', ') + '…');

            await Promise.all(batch.map(async (symbol) => {
                try {
                    // 5m Scan
                    const candles5m = await fetchKlines(symbol, '5m', 120);
                    const cross5m = checkEMACross(symbol, candles5m, '5m', 0);

                    updateMatchesStably(setBull5m, cross5m?.signal === 'EMA_CROSS_BULL' ? cross5m : null, symbol, 'EMA_CROSS_BULL');
                    updateMatchesStably(setBear5m, cross5m?.signal === 'EMA_CROSS_BEAR' ? cross5m : null, symbol, 'EMA_CROSS_BEAR');

                    // 15m Scan
                    const candles15m = await fetchKlines(symbol, '15m', 120);
                    const cross15m = checkEMACross(symbol, candles15m, '15m', 0);

                    updateMatchesStably(setBull15m, cross15m?.signal === 'EMA_CROSS_BULL' ? cross15m : null, symbol, 'EMA_CROSS_BULL');
                    updateMatchesStably(setBear15m, cross15m?.signal === 'EMA_CROSS_BEAR' ? cross15m : null, symbol, 'EMA_CROSS_BEAR');

                    // 1h Scan
                    const candles1h = await fetchKlines(symbol, '1h', 120);
                    const cross1h = checkEMACross(symbol, candles1h, '1h', 0);

                    updateMatchesStably(setBull1h, cross1h?.signal === 'EMA_CROSS_BULL' ? cross1h : null, symbol, 'EMA_CROSS_BULL');
                    updateMatchesStably(setBear1h, cross1h?.signal === 'EMA_CROSS_BEAR' ? cross1h : null, symbol, 'EMA_CROSS_BEAR');

                    // 4h Scan
                    const candles4h = await fetchKlines(symbol, '4h', 120);
                    const cross4h = checkEMACross(symbol, candles4h, '4h', 0);

                    updateMatchesStably(setBull4h, cross4h?.signal === 'EMA_CROSS_BULL' ? cross4h : null, symbol, 'EMA_CROSS_BULL');
                    updateMatchesStably(setBear4h, cross4h?.signal === 'EMA_CROSS_BEAR' ? cross4h : null, symbol, 'EMA_CROSS_BEAR');
                } catch (_) { }
            }));

            setTotalScanned(prev => prev + batch.length);
            scanIndexRef.current = (idx + batch.length) % currentUniverse.length;

            // Wait at least 1s between batches to prevent the UI from glitching extremely fast,
            // especially when the cache is hot and responses are instant (0ms).
            setTimeout(scanNext, 1000);
        };

        scanNext();
        return () => { isScanningRef.current = false; };
    }, [scanUniverse.length > 0]);

    return {
        bull5m, bear5m, bull15m, bear15m,
        bull1h, bear1h, bull4h, bear4h,
        totalScanned, scanStatus, weightInfo
    };
};


import { useState, useEffect, useRef, useMemo } from 'react';
import { SymbolInfo } from '../types';
import { fetchTickers, subscribeToMiniTickers, subscribeKlines } from '../services/binanceService';

const BLACKLIST = ['ALPACAUSDT', 'BNXUSDT', 'USDCUSDT'];

export const useTickers = () => {
    const [tickers, setTickers] = useState<SymbolInfo[]>([]);
    const [scanUniverse, setScanUniverse] = useState<string[]>([]);
    const tickerUpdateBufferRef = useRef<Map<string, any>>(new Map());

    // Use a map for O(1) ticker lookups
    const tickerMap = useMemo(() => new Map(tickers.map(t => [t.symbol, t])), [tickers]);

    useEffect(() => {
        const load = async () => {
            const data = await fetchTickers();
            setTickers(data);
        };
        load();
        const id = setInterval(load, 2 * 60_000); // Full refresh every 2 min
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (tickers.length === 0) return;

        const sub = subscribeToMiniTickers((arr) => {
            arr.forEach((u: any) => tickerUpdateBufferRef.current.set(u.s, u));
        });

        const flush = setInterval(() => {
            if (tickerUpdateBufferRef.current.size === 0) return;
            const updates = new Map<string, any>(tickerUpdateBufferRef.current);
            tickerUpdateBufferRef.current.clear();

            setTickers(prev => prev.map(t => {
                const u = updates.get(t.symbol);
                if (!u) return t;

                const open = parseFloat(u.o);
                const close = parseFloat(u.c);
                const change = open > 0 ? ((close - open) / open) * 100 : parseFloat(t.priceChangePercent);

                return {
                    ...t,
                    price: u.c,
                    priceChangePercent: change.toFixed(2),
                    quoteVolume: u.q ?? t.quoteVolume,
                    volume: u.v ?? t.volume
                };
            }).filter(t => {
                const change = parseFloat(t.priceChangePercent);
                return change >= 2 && change <= 10;
            }));
        }, 2000);

        return () => { sub.close(); clearInterval(flush); };
    }, [tickers.length > 0]);

    const symbolsJoined = useMemo(() => tickers.map(t => t.symbol).sort().join(','), [tickers]);

    useEffect(() => {
        if (tickers.length === 0) return;
        const universe = [...tickers]
            .filter(t => !BLACKLIST.includes(t.symbol))
            .map(t => t.symbol);

        setScanUniverse(universe);
        if (universe.length > 0) {
            subscribeKlines(universe, ['1m', '5m', '15m', '30m', '1h', '4h']);
        }
    }, [symbolsJoined]);

    return { tickers, scanUniverse, tickerMap };
};


import React, { useMemo } from 'react';
import { StrategyMatch, SymbolInfo } from '../types';
import { SignalCard } from './SignalCard';

interface LiveSignalsFeedProps {
    allSignals: StrategyMatch[];
    tickerMap: Map<string, SymbolInfo>;
}

export const LiveSignalsFeed = React.memo<LiveSignalsFeedProps>(({ allSignals, tickerMap }) => {
    const timeframes = ['5m', '15m', '1h', '4h'];

    const signalsByTf = useMemo(() => {
        const map: Record<string, StrategyMatch[]> = {};
        timeframes.forEach(tf => {
            map[tf] = allSignals
                .filter(s => s.timeframe === tf)
                .sort((a, b) => b.timestamp - a.timestamp);
        });
        return map;
    }, [allSignals]);

    if (allSignals.length === 0) {
        return (
            <div className="border border-dashed border-white/5 rounded-3xl bg-black/40 backdrop-blur-xl p-16 flex flex-col items-center justify-center gap-6 text-gray-600 animate-pulse">
                <div className="flex items-end gap-1.5 h-12">
                    {[6, 10, 15, 12, 8, 14, 10, 6].map((h, i) => (
                        <div
                            key={i}
                            className="w-2 rounded-full bg-gradient-to-t from-emerald-500/20 to-emerald-500/40"
                            style={{ height: `${h * 4}px`, animationDelay: `${i * 100}ms` }}
                        />
                    ))}
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.4em] text-white/40">Synchronizing Data Streams</span>
                    <span className="text-[10px] uppercase font-bold text-white/20 tracking-widest text-center max-w-xs leading-relaxed">
                        Scanning most volatile coins for EMA 5/8 crossover patterns. predictive signals manifest here in real-time.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-16">
            {timeframes.map(tf => {
                const matches = signalsByTf[tf];
                if (matches.length === 0) return null;
                return (
                    <div key={tf} className="flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em]">{tf} SIGNALS</span>
                            </div>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
                                {matches.length} VECTOR{matches.length > 1 ? 'S' : ''} ACTIVE
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {matches.map(m => (
                                <SignalCard
                                    key={`${m.symbol}-${m.timeframe}-${m.type}-feed`}
                                    match={m}
                                    ticker={tickerMap.get(m.symbol)}
                                    compact
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

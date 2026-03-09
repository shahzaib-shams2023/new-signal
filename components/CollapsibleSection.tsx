
import React, { useState, useEffect } from 'react';
import { StrategyMatch, SymbolInfo } from '../types';
import { SignalCard } from './SignalCard';

interface CollapsibleSectionProps {
    title: string;
    timeframe: string;
    matches: StrategyMatch[];
    tickerMap: Map<string, SymbolInfo>;
    color: string;
}

export const CollapsibleSection = React.memo<CollapsibleSectionProps>(({
    title, timeframe, matches, tickerMap, color
}) => {
    const [open, setOpen] = useState(matches.length > 0);

    useEffect(() => {
        if (matches.length > 0) setOpen(true);
    }, [matches.length > 0]);

    const colorMap: Record<string, string> = {
        purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    };

    const badgeStyle = colorMap[color] ?? colorMap.indigo;
    const hasBull = matches.some(m => m.type === 'BULLISH');
    const hasBear = matches.some(m => m.type === 'BEARISH');

    const signalColor = hasBull && !hasBear
        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
        : !hasBull && hasBear
            ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
            : 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20';

    return (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 group"
            >
                <span className={`px-3 py-1 rounded-lg text-xs font-black border ${badgeStyle} shadow-lg shadow-black/20`}>
                    {timeframe}
                </span>
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.3em] group-hover:text-white transition-colors">
                    {title}
                </h2>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                {matches.length > 0 && (
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full shadow-lg ${signalColor}`}>
                        {matches.length} DETECTED
                    </span>
                )}
                <div className={`text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : 'rotate-0'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </button>

            {open && (
                <div className="mt-8">
                    {matches.length === 0 ? (
                        <div className="h-32 border border-dashed border-white/5 rounded-2xl flex flex-col gap-3 items-center justify-center text-gray-600 bg-black/20 backdrop-blur-sm group hover:border-white/10 transition-colors">
                            <div className="flex gap-1.5">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-1.5 h-1.5 bg-emerald-500/20 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                                ))}
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Listening for market discrepancies on {timeframe} timeframe...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {matches.map(m => (
                                <SignalCard
                                    key={`${m.symbol}-${m.timeframe}-${m.type}`}
                                    match={m}
                                    ticker={tickerMap.get(m.symbol)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
});

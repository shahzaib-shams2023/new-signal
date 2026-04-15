
import React from 'react';
import { SymbolInfo, StrategyMatch } from '../types';
import StrategyCard from './StrategyCard';

interface ScannerSectionProps {
    title: string;
    timeframe: string;
    matches: StrategyMatch[];
    tickers: SymbolInfo[];
    color: string;
}

const ScannerSection: React.FC<ScannerSectionProps> = ({ title, timeframe, matches, tickers, color }) => {
    const colorStyles: Record<string, string> = {
        purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    };

    const badgeStyle = colorStyles[color] || colorStyles.indigo;

    return (
        <section className="animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
                <span className={`px-2.5 py-1 rounded text-xs font-black border ${badgeStyle} shadow-sm`}>{timeframe}</span>
                <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest">{title}</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-[#2b3139] to-transparent ml-4"></div>
            </div>
            {matches.length === 0 ? (
                <div className="h-32 border border-dashed border-[#2b3139] rounded-xl flex flex-col gap-2 items-center justify-center text-gray-600 bg-[#161a1e]/30">
                    <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-ping"></div>
                    <span className="text-xs font-medium uppercase tracking-widest opacity-60">Scanning {timeframe} Structure...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {matches.map(m => (
                        <StrategyCard key={`${m.symbol}-${m.type}`} match={m} ticker={tickers.find(t => t.symbol === m.symbol)} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default React.memo(ScannerSection);

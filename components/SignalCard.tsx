
import React from 'react';
import { StrategyMatch, SymbolInfo } from '../types';
import { formatPrice, timeAgo } from '../utils/formatters';
import { SignalBadge } from './SignalBadge';

interface SignalCardProps {
    match: StrategyMatch;
    ticker?: SymbolInfo;
    compact?: boolean;
}

export const SignalCard = React.memo<SignalCardProps>(({ match, ticker, compact }) => {
    const isBull = match.type === 'BULLISH';
    const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;

    const accentBorder = isBull ? 'hover:border-emerald-500/50' : 'hover:border-rose-500/50';
    const sideLine = isBull
        ? 'bg-gradient-to-b from-emerald-500/80 via-emerald-500/30 to-transparent'
        : 'bg-gradient-to-b from-rose-500/80 via-rose-500/30 to-transparent';
    const moveAccent = isBull ? 'text-[#00ffcc]' : 'text-[#ff3e8d]';
    const entryLabel = isBull ? 'Entry (Long)' : 'Entry (Short)';

    if (compact) {
        return (
            <div className={`relative group rounded-xl bg-[#1e2329]/80 backdrop-blur-sm border border-[#2b3139] ${accentBorder} transition-all duration-300 overflow-hidden flex items-center gap-3 px-4 py-3 min-w-0 w-full hover:shadow-lg hover:shadow-black/20`}>
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${sideLine} rounded-l-xl`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-gray-100">{match.symbol.replace('USDT', '')}</span>
                        <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border-indigo-500/20 border px-1.5 py-0.5 rounded">{match.timeframe}</span>
                        <div className="flex-1 flex justify-end">
                            <span className="text-[10px] text-gray-500 font-medium">{timeAgo(match.timestamp)}</span>
                        </div>
                    </div>
                    <div className="mt-1 mb-1">
                        <SignalBadge signal={match.signal} />
                    </div>
                    <div className="grid grid-cols-2 mt-1 gap-x-4 gap-y-1">
                        <div className="text-xs font-mono text-gray-300">
                            <span className="text-[9px] uppercase text-gray-500 block font-bold tracking-tighter">Current</span>
                            ${formatPrice(match.price)}
                        </div>
                        {match.entryPrice && (
                            <div className={`text-xs font-mono ${moveAccent}`}>
                                <span className="text-[9px] uppercase text-gray-500 block font-bold tracking-tighter">Entry</span>
                                ${formatPrice(match.entryPrice)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-black ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
                    <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">SENTINEL</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative group rounded-2xl bg-[#1c2127]/60 backdrop-blur-md border border-white/5 ${accentBorder} transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)] hover:-translate-y-1.5 overflow-hidden`}>
            <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${sideLine} rounded-l-2xl shadow-[0_0_15px_rgba(0,0,0,0.2)]`} />
            <div className="pl-4 pr-5 py-5 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-black text-gray-100 tracking-tight">{match.symbol.replace('USDT', '')}</h3>
                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border-indigo-500/20 border px-2 py-0.5 rounded">{match.timeframe}</span>
                            <SignalBadge signal={match.signal} />
                        </div>
                        <div className="text-2xl font-mono font-medium text-gray-200 mt-1 tracking-tighter">${formatPrice(match.price)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border ${change >= 0 ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' : 'text-rose-400 bg-rose-500/5 border-rose-500/10'}`}>
                            <span className="text-xs font-bold">{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-medium">{timeAgo(match.timestamp)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className={`${isBull ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'} border rounded-lg px-3 py-2.5 transition-colors group-hover:bg-white/5`}>
                        <div className={`text-[9px] ${isBull ? 'text-emerald-400/70' : 'text-rose-400/70'} uppercase tracking-wider font-bold`}>{entryLabel}</div>
                        <div className={`text-[13px] font-mono font-bold ${isBull ? 'text-emerald-300' : 'text-rose-300'} mt-0.5`}>${formatPrice(match.entryPrice ?? match.price)}</div>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2.5 transition-colors group-hover:bg-rose-500/10">
                        <div className="text-[9px] text-rose-400/70 uppercase tracking-wider font-bold">Stop Loss</div>
                        <div className="text-[13px] font-mono font-bold text-rose-300 mt-0.5">${formatPrice(match.stopLoss ?? 0)}</div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2.5 transition-colors group-hover:bg-emerald-500/20">
                        <div className="text-[9px] text-emerald-400 uppercase tracking-wider font-bold">Target (TP)</div>
                        <div className="text-[13px] font-mono font-bold text-white mt-0.5">${formatPrice(match.takeProfit ?? 0)}</div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex gap-1.5">
                        {[1, 2, 3].map((_, i) => (
                            <div key={i} className={`w-1 h-3 rounded-full ${isBull ? 'bg-emerald-500/30' : 'bg-rose-500/30'} ${i === 1 ? 'h-4' : ''}`} />
                        ))}
                    </div>
                    <span className="text-[9px] font-black text-gray-600 tracking-[0.2em] uppercase">High Volume Confirmed</span>
                </div>
            </div>
        </div>
    );
});


import React from 'react';
import { SymbolInfo, StrategyMatch } from '../types';

const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '0.00';
    return num < 1 ? num.toFixed(6) : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface StrategyCardProps {
    match: StrategyMatch;
    ticker?: SymbolInfo;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ match, ticker }) => {
    const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;
    const isPositive = change >= 0;
    const isBullish = match.type === 'BULLISH';

    return (
        <div className={`relative group rounded-xl bg-[#1e2329] border ${isBullish ? 'border-[#2b3139] hover:border-indigo-500/50' : 'border-[#2b3139] hover:border-rose-500/50'} transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-1 overflow-hidden`}>
            {/* Top Glow on Hover */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${isBullish ? 'via-indigo-500' : 'via-rose-500'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

            <div className="p-5 flex flex-col gap-4">
                {/* Header: Symbol & Price */}
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-100 tracking-tight">{match.symbol.replace('USDT', '')}</h3>
                            <span className={`text-[10px] font-bold ${isBullish ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' : 'text-rose-300 bg-rose-500/10 border-rose-500/20'} px-2 py-0.5 rounded border`}>{match.timeframe}</span>
                        </div>
                        <div className="text-2xl font-mono font-medium text-gray-200 mt-1 tracking-tighter">${formatPrice(match.price)}</div>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border backdrop-blur-sm ${isPositive ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' : 'text-rose-400 bg-rose-500/5 border-rose-500/10'}`}>
                        <span className="text-xs font-bold">{isPositive ? '+' : ''}{change.toFixed(2)}%</span>
                    </div>
                </div>

                {/* Analysis Grid */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0b0e11]/50 p-2.5 rounded-lg border border-[#2b3139] group-hover:border-[#363c45] transition-colors relative overflow-hidden">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Trend</span>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${isBullish ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'}`}></div>
                            <span className="text-xs font-medium text-gray-300">{match.signal === '3_CANDLE_IMPULSE' ? 'Strong Impulse' : 'Valid Impulse'}</span>
                        </div>
                    </div>
                    <div className="bg-[#0b0e11]/50 p-2.5 rounded-lg border border-[#2b3139] group-hover:border-[#363c45] transition-colors relative overflow-hidden">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Volume Spike</span>
                        <div className="flex items-center gap-1.5 mt-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${match.volumeSpike ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-gray-700'}`}></div>
                            <span className="text-xs font-medium text-gray-300">{match.volumeSpike ? 'Confirmed' : 'Normal'}</span>
                            {match.volumeSpike && <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/10 rounded-bl-3xl"></div>}
                        </div>
                    </div>
                </div>

                {/* Footer / MACD Visual */}
                <div className="pt-3 border-t border-[#2b3139] flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-500 flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        MACD CONFIRMED
                    </span>
                    <div className="flex gap-0.5">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className={`w-1 h-3 rounded-full ${i <= 3 ? (isBullish ? 'bg-emerald-500' : 'bg-rose-500') : (isBullish ? 'bg-emerald-500/30' : 'bg-rose-500/30')} ${i === 4 && 'animate-pulse'}`}></div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(StrategyCard, (prevProps, nextProps) => {
    return (
        prevProps.match.timestamp === nextProps.match.timestamp &&
        prevProps.ticker?.price === nextProps.ticker?.price &&
        prevProps.ticker?.priceChangePercent === nextProps.ticker?.priceChangePercent
    );
});

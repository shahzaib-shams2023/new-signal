
import React from 'react';
import { SymbolInfo } from '../types';
import { formatPrice } from '../utils/formatters';

interface TickerRowProps {
    ticker: SymbolInfo;
    hasSignal: boolean;
    isBullSig: boolean;
}

export const TickerRow = React.memo<TickerRowProps>(({ ticker, hasSignal, isBullSig }) => {
    const change = parseFloat(ticker.priceChangePercent);

    return (
        <div
            className={`group flex justify-between items-center p-3 hover:bg-white/5 rounded-xl transition-all duration-300 border border-transparent ${hasSignal ? (isBullSig ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10') : ''}`}
        >
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-gray-300 group-hover:text-white transition-colors">{ticker.symbol.replace('USDT', '')}</span>
                    {hasSignal && (
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px] ${isBullSig ? 'bg-emerald-400 shadow-emerald-400/50' : 'bg-rose-400 shadow-rose-400/50'}`} />
                    )}
                </div>
                <span className="text-[10px] text-gray-600 font-mono font-medium">${formatPrice(ticker.price)}</span>
            </div>
            <div className={`text-[10px] font-black px-2 py-1 rounded-lg border shadow-sm ${change >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10' : 'text-rose-400 bg-rose-500/10 border-rose-500/10'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>
        </div>
    );
});


import React from 'react';
import { SymbolInfo } from '../types';

const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return '0.00';
    return num < 1 ? num.toFixed(6) : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface SidebarProps {
    sidebarAssets: SymbolInfo[];
}

const Sidebar: React.FC<SidebarProps> = ({ sidebarAssets }) => {
    return (
        <aside className="hidden xl:flex flex-col w-72 bg-[#161a1e] border-r border-[#2b3139] z-20 shadow-2xl shrink-0">
            <div className="p-5 border-b border-[#2b3139]">
                <h2 className="text-xs font-black text-gray-100 flex items-center gap-2 tracking-widest uppercase">
                    <span className="w-1.5 h-4 bg-orange-500 rounded-sm"></span>
                    Volatility Zone
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
                {sidebarAssets.map(ticker => {
                    const change = parseFloat(ticker.priceChangePercent);
                    return (
                        <div key={ticker.symbol} className="flex justify-between items-center p-3 hover:bg-[#2b3139]/50 rounded-lg transition-all border border-transparent hover:border-[#2b3139]">
                            <div className="flex flex-col">
                                <span className="font-bold text-sm text-gray-300">{ticker.symbol.replace('USDT', '')}</span>
                                <span className="text-[10px] text-gray-500">${formatPrice(ticker.price)}</span>
                            </div>
                            <span className={`text-[11px] font-bold ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
};

export default React.memo(Sidebar);

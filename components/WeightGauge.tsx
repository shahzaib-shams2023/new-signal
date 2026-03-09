
import React from 'react';

interface WeightGaugeProps {
    pct: number;
    used: number;
}

export const WeightGauge = React.memo<WeightGaugeProps>(({ pct, used }) => {
    const color = pct > 75 ? 'bg-rose-500' : pct > 55 ? 'bg-amber-500' : 'bg-emerald-500';
    const textColor = pct > 75 ? 'text-rose-400' : pct > 55 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <div className="hidden md:flex flex-col gap-1 min-w-[96px]">
            <div className="flex justify-between text-[9px] text-gray-500 uppercase tracking-widest font-black">
                <span>API LOAD</span>
                <span className={`w-14 text-right ${textColor}`}>{used}/2400</span>
            </div>
            <div className="h-1.5 w-full bg-[#2b3139] rounded-full overflow-hidden shadow-inner shadow-black/20">
                <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${color} shadow-[0_0_8px] ${pct > 75 ? 'shadow-rose-500/50' : 'shadow-emerald-500/50'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
        </div>
    );
});


import React from 'react';
import { StrategyMatch } from '../types';

interface SignalBadgeProps {
    signal: StrategyMatch['signal'];
}

export const SignalBadge: React.FC<SignalBadgeProps> = ({ signal }) => {
    const isBull = signal === 'EMA_CROSS_BULL';
    const label = isBull ? '⚡ EMA 5/8 CROSS (BULL)' : '⚡ EMA 5/8 CROSS (BEAR)';

    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded border tracking-wider animate-in fade-in zoom-in duration-300 ${isBull
            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
            : 'text-rose-300 bg-rose-500/10 border-rose-500/30'
            }`}>
            {label}
        </span>
    );
};

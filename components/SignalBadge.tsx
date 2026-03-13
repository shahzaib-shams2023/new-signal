
import React from 'react';
import { StrategyMatch } from '../types';

interface SignalBadgeProps {
    signal: StrategyMatch['signal'];
}

export const SignalBadge: React.FC<SignalBadgeProps> = ({ signal }) => {
    const isBull = signal.includes('BULL');
    let label = 'UNKNOWN';

    if (signal === 'IMPULSE_BULL') label = '🚀 BULL IMPULSE';
    else if (signal === 'IMPULSE_BEAR') label = '🔥 BEAR IMPULSE';
    else label = `📡 ${signal.replace(/_/g, ' ')}`;

    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded border tracking-wider animate-in fade-in zoom-in duration-300 ${isBull
            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
            : 'text-rose-300 bg-rose-500/10 border-rose-500/30'
            }`}>
            {label}
        </span>
    );
};

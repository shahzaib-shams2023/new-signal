
import React from 'react';
import { WeightGauge } from './WeightGauge';

interface HeaderProps {
    view: 'feed' | 'detail';
    setView: (v: 'feed' | 'detail') => void;
    totalSignals: number;
    bullCount: number;
    bearCount: number;
    weightInfo: { used: number; pct: number };
    scanStatus: string;
}

export const Header = React.memo<HeaderProps>(({
    view, setView, totalSignals, bullCount, bearCount, weightInfo, scanStatus
}) => (
    <header className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139] bg-[#0b0e11]/95 backdrop-blur-xl z-30 shrink-0 sticky top-0">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
                <div className="flex h-4 w-4 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-lg font-black text-white tracking-tighter leading-none">
                        SENTINEL <span className="text-gray-600 font-light">CORE</span>
                    </h1>
                    <span className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-[0.2em]">Alpha Terminal v1.0</span>
                </div>
            </div>

            <div className="h-8 w-px bg-white/5 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest leading-none">Market Sentiment</span>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-bold text-emerald-400">{bullCount} LONG</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                        <span className="text-xs font-bold text-rose-400">{bearCount} SHORT</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <WeightGauge pct={weightInfo.pct} used={weightInfo.used} />

            <div className="flex items-center bg-[#161a1e] border border-[#2b3139] rounded-xl p-1 shadow-inner shadow-black/40">
                <button
                    onClick={() => setView('feed')}
                    className={`px-4 py-1.5 rounded-lg text-[11px] font-black transition-all duration-300 ${view === 'feed' ? 'bg-[#2b3139] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    FEED
                </button>
                <button
                    onClick={() => setView('detail')}
                    className={`px-4 py-1.5 rounded-lg text-[11px] font-black transition-all duration-300 ${view === 'detail' ? 'bg-[#2b3139] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    MATRIX
                </button>
            </div>

            <div className="hidden lg:flex flex-col items-end min-w-[120px] bg-black/20 px-3 py-1 rounded-lg border border-white/5">
                <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black leading-none mb-1">Live Subsystem</span>
                <span className="text-[11px] font-mono text-emerald-400 truncate text-right w-full animate-pulse">{scanStatus || 'IDLE'}</span>
            </div>
        </div>
    </header>
));

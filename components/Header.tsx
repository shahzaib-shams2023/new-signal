
import React from 'react';

interface HeaderProps {
    apiStatus: {
        weight: number;
        queueSize: number;
        isLimited: boolean;
    };
    alertEnabled: boolean;
    onShowAlertSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ apiStatus, alertEnabled, onShowAlertSettings }) => {
    return (
        <header className="flex items-center justify-between px-8 py-6 border-b border-[#2b3139] bg-[#0b0e11]/95 backdrop-blur z-10 shrink-0">
            <div>
                <h1 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                    <span className="flex h-3 w-3 relative">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${apiStatus.isLimited ? 'bg-rose-400' : 'bg-indigo-400'} opacity-75`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${apiStatus.isLimited ? 'bg-rose-500' : 'bg-indigo-500'}`}></span>
                    </span>
                    MOMENTUM <span className="text-gray-600 font-light">SCANNERS</span>
                </h1>
            </div>

            <div className="flex items-center gap-6">
                {/* API Status Info */}
                <div className="flex items-center gap-4 text-[10px] bg-[#161a1e] px-4 py-2 rounded-lg border border-[#2b3139]">
                    <div className="flex flex-col">
                        <span className="text-gray-500 uppercase font-bold tracking-widest">Weight</span>
                        <span className={`${apiStatus.weight > 1800 ? 'text-orange-400' : 'text-emerald-400'}`}>{apiStatus.weight}/2400</span>
                    </div>
                    <div className="w-px h-6 bg-[#2b3139]"></div>
                    <div className="flex flex-col text-right">
                        <span className="text-gray-500 uppercase font-bold tracking-widest">Queue</span>
                        <span>{apiStatus.queueSize} Tasks</span>
                    </div>
                </div>

                <button
                    onClick={onShowAlertSettings}
                    className={`p-2 rounded-lg border transition-all ${alertEnabled ? 'border-indigo-500/50 text-indigo-400 bg-indigo-500/10' : 'border-[#2b3139] text-gray-500 hover:text-gray-300'}`}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                </button>
            </div>
        </header>
    );
};

export default React.memo(Header);

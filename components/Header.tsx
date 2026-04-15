
import React from 'react';

interface HeaderProps {
    apiStatus: {
        weight: number;
        queueSize: number;
        isLimited: boolean;
    };
}

const Header: React.FC<HeaderProps> = ({ apiStatus }) => {
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
            </div>
        </header>
    );
};

export default React.memo(Header);

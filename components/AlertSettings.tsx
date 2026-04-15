
import React from 'react';

interface AlertSettingsProps {
    config: {
        topic: string;
        enabled: boolean;
    };
    onUpdate: (config: { topic: string; enabled: boolean }) => void;
    isVisible: boolean;
}

const AlertSettings: React.FC<AlertSettingsProps> = ({ config, onUpdate, isVisible }) => {
    if (!isVisible) return null;

    return (
        <div className="absolute top-24 right-8 w-80 bg-[#161a1e] border border-[#2b3139] rounded-xl shadow-2xl p-6 z-50 animate-fade-in">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4">FREE Unlimited Notifications</h3>
            <div className="space-y-4">
                <div>
                    <label className="text-[10px] text-gray-500 block mb-1 uppercase">Your Secret Topic</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={config.topic}
                            onChange={(e) => onUpdate({ ...config, topic: e.target.value })}
                            className="flex-1 bg-[#0b0e11] border border-[#2b3139] rounded px-3 py-2 text-xs text-indigo-400 font-bold"
                        />
                    </div>
                </div>

                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg">
                    <span className="text-[10px] text-indigo-300 font-bold block mb-1 uppercase">How to get alerts:</span>
                    <ol className="text-[10px] text-gray-400 space-y-1 list-decimal pl-3">
                        <li>Install <b>ntfy</b> app on your phone</li>
                        <li>Tap <b>+ (Subscribe)</b></li>
                        <li>Enter: <b>{config.topic}</b></li>
                    </ol>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#2b3139]">
                    <span className="text-xs">Enabled</span>
                    <button
                        onClick={() => onUpdate({ ...config, enabled: !config.enabled })}
                        className={`w-10 h-5 rounded-full relative transition-colors ${config.enabled ? 'bg-indigo-500' : 'bg-gray-700'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.enabled ? 'left-6' : 'left-1'}`}></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(AlertSettings);

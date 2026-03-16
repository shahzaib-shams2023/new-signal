import React, { useMemo } from 'react';
import { Header } from './components/Header';
import { LiveSignalsFeed } from './components/LiveSignalsFeed';
import { TickerRow } from './components/TickerRow';
import { useTickers } from './hooks/useTickers';
import { useScanner } from './hooks/useScanner';
import { StrategyMatch } from './types';

const App: React.FC = () => {
  const { tickers, scanUniverse, tickerMap } = useTickers();
  const {
    bull1m, bear1m,
    bull5m, bear5m, bull30m, bear30m,
    bull1h, bear1h, bull4h, bear4h,
    totalScanned, scanStatus, weightInfo
  } = useScanner(scanUniverse);



  // Derived Statistics
  const allSignals = useMemo(() => {
    const now = Date.now();
    const signals = [
      ...bull1m, ...bear1m,
      ...bull30m, ...bear30m,
      ...bull1h, ...bear1h,
      ...bull4h, ...bear4h
    ];
    return signals
      .filter(s => {
        const ageMs = now - s.timestamp;
        if (s.timeframe === '1m') return ageMs < 30 * 60 * 1000;    // 30m
        if (s.timeframe === '5m') return ageMs < 60 * 60 * 1000;    // 1h

        if (s.timeframe === '30m') return ageMs < 4 * 60 * 60 * 1000; // 4h
        if (s.timeframe === '1h') return ageMs < 4 * 60 * 60 * 1000; // 4h
        if (s.timeframe === '4h') return ageMs < 12 * 60 * 60 * 1000; // 12h
        return ageMs < 60 * 60 * 1000;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [bull1m, bear1m, bull5m, bear5m, bull30m, bear30m, bull1h, bear1h, bull4h, bear4h]);

  const activeSignalMap = useMemo(() => {
    const map = new Map<string, StrategyMatch>();
    allSignals.forEach(s => {
      if (!map.has(s.symbol)) map.set(s.symbol, s);
    });
    return map;
  }, [allSignals]);

  const bullCount = allSignals.filter(s => s.type === 'BULLISH').length;
  const bearCount = allSignals.filter(s => s.type === 'BEARISH').length;



  const stableSidebarAssets = useMemo(() => {
    return [...tickers].slice(0, 100);
  }, [tickers]); // Update when price/list changes

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-sans selection:bg-emerald-500 selection:text-white overflow-hidden">
      {/* --- Sidebar Left: Market Universe --- */}
      <aside className="hidden lg:flex flex-col w-72 bg-[#161a1e] border-r border-white/5 z-20 shadow-2xl shrink-0">
        <div className="p-5 border-b border-white/5 bg-black/20">
          <h2 className="text-[10px] font-black text-gray-500 flex items-center gap-2 tracking-[0.3em] uppercase">
            <span className="w-1 h-3 bg-emerald-500 rounded-full" />
            Market Watch
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          {tickers.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-gray-600 text-[10px] font-black uppercase tracking-widest animate-pulse">
              Initializing Engine...
            </div>
          ) : stableSidebarAssets.map(ticker => {
            const sig = activeSignalMap.get(ticker.symbol);
            return (
              <TickerRow
                key={ticker.symbol}
                ticker={ticker}
                hasSignal={!!sig}
                isBullSig={sig?.type === 'BULLISH'}
              />
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-md">
          <div className="flex justify-between text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-3">
            <span>Scanning {scanUniverse.length} Assets</span>
            <span>{totalScanned} Cycles</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-1000"
              style={{ width: `${(totalScanned % 100)}%` }}
            />
          </div>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0d1117] relative">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 blur-[150px] rounded-full pointer-events-none animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none animate-pulse-slow" style={{ animationDelay: '1.5s' }} />

        <Header
          view="feed"
          setView={() => { }}
          totalSignals={allSignals.length}
          bullCount={bullCount}
          bearCount={bearCount}
          weightInfo={weightInfo}
          scanStatus={scanStatus}
        />

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-8 lg:p-12 max-w-[1700px] mx-auto min-h-full">
            <div className="space-y-10">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_#34d399]" />
                  <h2 className="text-xs font-black text-white uppercase tracking-[0.5em]">Sentinel Intelligence stream</h2>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                <div className="flex items-center gap-4 text-[9px] text-gray-600 font-black uppercase tracking-widest">
                  <span>Protocol v1.10</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>Impulse Analytics</span>
                </div>
              </div>
              <LiveSignalsFeed allSignals={allSignals} tickerMap={tickerMap} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;

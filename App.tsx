
import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { LiveSignalsFeed } from './components/LiveSignalsFeed';
import { CollapsibleSection } from './components/CollapsibleSection';
import { TickerRow } from './components/TickerRow';
import { useTickers } from './hooks/useTickers';
import { useScanner } from './hooks/useScanner';
import { StrategyMatch } from './types';
import { formatPrice } from './utils/formatters';

const App: React.FC = () => {
  const { tickers, scanUniverse, tickerMap } = useTickers();
  const {
    bull1m, bear1m, bull5m, bear5m, bull15m, bear15m, bull30m, bear30m,
    bull1h, bear1h, bull4h, bear4h,
    totalScanned, scanStatus, weightInfo
  } = useScanner(scanUniverse);

  const [view, setView] = useState<'feed' | 'detail'>('feed');
  const [performanceHistory, setPerformanceHistory] = useState<StrategyMatch[]>([]);

  // Derived Statistics
  const allSignals = useMemo(() => {
    const cutoff = Date.now() - (2 * 60 * 60 * 1000); // 2h recent only
    const signals = [
      ...bull1m, ...bear1m,
      ...bull5m, ...bear5m,
      ...bull15m, ...bear15m,
      ...bull30m, ...bear30m,
      ...bull1h, ...bear1h,
      ...bull4h, ...bear4h
    ];
    return signals
      .filter(s => s.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [bull1m, bear1m, bull5m, bear5m, bull15m, bear15m, bull30m, bear30m, bull1h, bear1h, bull4h, bear4h]);

  const activeSignalMap = useMemo(() => {
    const map = new Map<string, StrategyMatch>();
    allSignals.forEach(s => {
      if (!map.has(s.symbol)) map.set(s.symbol, s);
    });
    return map;
  }, [allSignals]);

  const bullCount = allSignals.filter(s => s.type === 'BULLISH').length;
  const bearCount = allSignals.filter(s => s.type === 'BEARISH').length;

  // Performance Tracking (Crossover Resolution)
  useEffect(() => {
    if (tickers.length === 0 || allSignals.length === 0) return;

    // 1. Identify active (unresolved) signals from the 48h history
    const resolvedIds = new Set(performanceHistory.map(h => `${h.symbol}-${h.timestamp}`));
    const activeSignals = allSignals.filter(s => !resolvedIds.has(`${s.symbol}-${s.timestamp}`));

    if (activeSignals.length === 0) return;

    activeSignals.forEach(sig => {
      // Find if there's a NEWER signal of the OPPOSITE type for the same symbol
      const exitSignal = allSignals.find(s =>
        s.symbol === sig.symbol &&
        s.timestamp > sig.timestamp &&
        s.type !== sig.type
      );

      if (exitSignal) {
        let outcome: 'WIN' | 'LOSS' = 'LOSS';

        if (sig.type === 'BULLISH') {
          outcome = exitSignal.price > (sig.entryPrice || sig.price) ? 'WIN' : 'LOSS';
        } else {
          outcome = exitSignal.price < (sig.entryPrice || sig.price) ? 'WIN' : 'LOSS';
        }

        setPerformanceHistory(prev => {
          if (prev.some(h => h.symbol === sig.symbol && h.timestamp === sig.timestamp)) return prev;
          const updated = [{
            ...sig,
            status: outcome,
            exitPrice: exitSignal.price,
            exitTimestamp: exitSignal.timestamp
          }, ...prev];
          return updated.slice(0, 50);
        });
      }
    });
  }, [allSignals]);

  const winRate = useMemo(() => {
    if (performanceHistory.length === 0) return 0;
    const wins = performanceHistory.filter(h => h.status === 'WIN').length;
    return (wins / performanceHistory.length) * 100;
  }, [performanceHistory]);

  const stableSidebarAssets = useMemo(() => {
    return [...tickers].slice(0, 100);
  }, [tickers.length > 0]); // Only update when tickers list changes significantly

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
          view={view}
          setView={setView}
          totalSignals={allSignals.length}
          bullCount={bullCount}
          bearCount={bearCount}
          weightInfo={weightInfo}
          scanStatus={scanStatus}
        />

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-8 lg:p-12 max-w-[1700px] mx-auto min-h-full">
            {view === 'feed' ? (
              <div className="space-y-10">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_#34d399]" />
                    <h2 className="text-xs font-black text-white uppercase tracking-[0.5em]">Sentinel Intelligence stream</h2>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  <div className="flex items-center gap-4 text-[9px] text-gray-600 font-black uppercase tracking-widest">
                    <span>Protocol v1.02</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>Market Trend Analysis</span>
                  </div>
                </div>
                <LiveSignalsFeed allSignals={allSignals} tickerMap={tickerMap} />
              </div>
            ) : (
              <div className="space-y-16">
                <div className="space-y-12">
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (1m)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="1m" matches={bull1m} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="1m" matches={bear1m} tickerMap={tickerMap} color="rose" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (5m)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="5m" matches={bull5m} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="5m" matches={bear5m} tickerMap={tickerMap} color="rose" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (15m)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="15m" matches={bull15m} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="15m" matches={bear15m} tickerMap={tickerMap} color="rose" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (30m)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="30m" matches={bull30m} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="30m" matches={bear30m} tickerMap={tickerMap} color="rose" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (1h)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="1h" matches={bull1h} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="1h" matches={bear1h} tickerMap={tickerMap} color="rose" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Trend Matrix (4h)</h3>
                    <CollapsibleSection title="High Conviction Bullish" timeframe="4h" matches={bull4h} tickerMap={tickerMap} color="emerald" />
                    <CollapsibleSection title="Strategic Exit & Short" timeframe="4h" matches={bear4h} tickerMap={tickerMap} color="rose" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- Sidebar Right: Performance --- */}
      <aside className="hidden xl:flex flex-col w-80 bg-[#161a1e] border-l border-white/5 z-20 shadow-2xl shrink-0">
        <div className="p-5 border-b border-white/5 bg-black/20">
          <h2 className="text-[10px] font-black text-gray-500 flex items-center gap-2 tracking-[0.3em] uppercase">
            <span className="w-1 h-3 bg-indigo-500 rounded-full" />
            Performance Matrix
          </h2>
        </div>

        <div className="p-6 space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/20 p-5 rounded-2xl border border-white/5 text-center group hover:bg-black/30 transition-all">
              <span className="block text-[8px] text-gray-600 uppercase font-black tracking-widest mb-2">Win Rate</span>
              <span className={`text-2xl font-black ${winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'} text-shadow-glow`}>
                {winRate.toFixed(1)}%
              </span>
            </div>
            <div className="bg-black/20 p-5 rounded-2xl border border-white/5 text-center group hover:bg-black/30 transition-all">
              <span className="block text-[8px] text-gray-600 uppercase font-black tracking-widest mb-2">Total Events</span>
              <span className="text-2xl font-black text-white text-shadow-glow">
                {performanceHistory.length}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Historical Outcomes</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
              {performanceHistory.length === 0 ? (
                <div className="text-center py-20 bg-black/10 rounded-2xl border border-dashed border-white/5 opacity-30 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Awaiting Analysis Resolution</span>
                </div>
              ) : performanceHistory.map((h, i) => {
                const entry = h.entryPrice || h.price;
                const exit = h.exitPrice || 0;
                const roi = entry > 0 ? ((exit - entry) / entry) * 100 : 0;
                const isWin = h.status === 'WIN';

                return (
                  <div key={`${h.symbol}-${h.timestamp}-${i}`} className={`flex flex-col gap-2 p-3 rounded-xl border animate-in fade-in slide-in-from-right-4 duration-300 ${isWin ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded shadow-sm ${isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {h.status}
                        </span>
                        <span className="font-black text-xs text-gray-100 uppercase tracking-tighter">{h.symbol.replace('USDT', '')}</span>
                      </div>
                      <span className={`text-[10px] font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-gray-500">
                      <div>
                        <span className="opacity-40 block uppercase tracking-tighter">In</span>
                        <span className="text-gray-300 font-bold">${formatPrice(entry)}</span>
                      </div>
                      <div className="text-right">
                        <span className="opacity-40 block uppercase tracking-tighter">Out</span>
                        <span className="text-gray-300 font-bold">${formatPrice(exit)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-white/5 bg-black/40 backdrop-blur-xl">
          <div className="flex justify-between text-[8px] font-black text-gray-500 uppercase tracking-widest mb-3">
            <span>Accuracy Probability</span>
            <span className="text-white/60">{winRate.toFixed(0)}% Precise</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex shadow-inner">
            <div className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: `${winRate}%` }} />
            <div className="h-full bg-rose-500 transition-all duration-1000 shadow-[0_0_8px_rgba(244,63,94,0.5)]" style={{ width: `${100 - winRate}%` }} />
          </div>
        </div>
      </aside>
    </div>
  );
};

export default App;

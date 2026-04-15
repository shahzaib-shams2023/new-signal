import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchTickers, subscribeToAllTickers, fetchKlines, getRateLimitStatus } from './services/binanceService';
import { checkMomentumStrategy, checkBearishMomentumStrategy } from './services/indicators';
import { SymbolInfo, StrategyMatch } from './types';

// Components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ScannerSection from './components/ScannerSection';

// --- Constants ---
const BLACKLIST = ['ALPACAUSDT', 'BNXUSDT', 'USDCUSDT'];
const TIMEFRAMES = ['15m', '1h', '4h'] as const;

const App: React.FC = () => {
  const [tickers, setTickers] = useState<SymbolInfo[]>([]);
  const [matches15m, setMatches15m] = useState<StrategyMatch[]>([]);
  const [matches1h, setMatches1h] = useState<StrategyMatch[]>([]);
  const [matches4h, setMatches4h] = useState<StrategyMatch[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('Initializing...');
  const [apiStatus, setApiStatus] = useState(getRateLimitStatus());

  const scanIndexRef = useRef(0);
  const tfIndexRef = useRef(0);
  const isScanningRef = useRef(false);

  // Initial Data Load
  useEffect(() => {
    fetchTickers().then(data => setTickers(data));
  }, []);

  // Real-time API Updates
  useEffect(() => {
    const timer = setInterval(() => {
      setApiStatus(getRateLimitStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Real-time Ticker Updates
  useEffect(() => {
    if (tickers.length === 0) return;
    const ws = subscribeToAllTickers((updateArr) => {
      const updateMap = new Map(updateArr.map(u => [u.s, u]));
      setTickers(prev => prev.map(t => {
        const u = updateMap.get(t.symbol);
        return u ? {
          ...t,
          price: u.c,
          priceChangePercent: u.P,
          quoteVolume: u.q,
          highPrice: u.h,
          lowPrice: u.l,
          volume: u.v
        } : t;
      }));
    });
    return () => ws.close();
  }, [tickers.length > 0]);

  // Sidebar List (Top 50 Gainers)
  const sidebarAssets = useMemo(() => {
    return tickers
      .filter(t => parseFloat(t.priceChangePercent) > 0)
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 50);
  }, [tickers]);

  // --- Background Scanner Logic (Optimized Parallel Scanning) ---
  useEffect(() => {
    if (tickers.length === 0 || isScanningRef.current) return;

    isScanningRef.current = true;

    const scanUniverse = [...tickers]
      .filter(t => !BLACKLIST.includes(t.symbol) && parseFloat(t.priceChangePercent) > 0)
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 50) // Scan top 50 gainers
      .map(t => t.symbol);

    const scanNext = async () => {
      const CHUNK_SIZE = 5;
      const symbolsToScan = [];
      const timeframe = TIMEFRAMES[tfIndexRef.current];

      for (let i = 0; i < CHUNK_SIZE; i++) {
        const idx = (scanIndexRef.current + i) % scanUniverse.length;
        symbolsToScan.push(scanUniverse[idx]);
      }

      setScanStatus(`${timeframe}: ${symbolsToScan[0]}...`);

      await Promise.all(symbolsToScan.map(async (symbol) => {
        try {
          const candles = await fetchKlines(symbol, timeframe, 60);
          const bullMatch = checkMomentumStrategy(symbol, candles, timeframe);
          const bearMatch = checkBearishMomentumStrategy(symbol, candles, timeframe);

          if (bullMatch || bearMatch) {
            const updateState = timeframe === '15m' ? setMatches15m : 
                               timeframe === '1h' ? setMatches1h : setMatches4h;
            
            updateState(prev => {
              const unfiltered = prev.filter(m => m.symbol !== symbol);
              const matches = [];
              if (bullMatch) matches.push(bullMatch);
              if (bearMatch) matches.push(bearMatch);
              return [...matches, ...unfiltered].slice(0, 20);
            });
          }
        } catch (e) {
          // Handled in binanceService
        }
      }));

      scanIndexRef.current = (scanIndexRef.current + CHUNK_SIZE) % scanUniverse.length;
      
      // If we finished a full cycle of symbols for one timeframe, move to next timeframe
      if (scanIndexRef.current === 0) {
        tfIndexRef.current = (tfIndexRef.current + 1) % TIMEFRAMES.length;
      }

      setTimeout(scanNext, 200);
    };

    scanNext();
    return () => { isScanningRef.current = false; };
  }, [tickers.length > 0]);

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-mono selection:bg-indigo-500 selection:text-white overflow-hidden">

      <Sidebar sidebarAssets={sidebarAssets} />

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <Header apiStatus={apiStatus} />

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin bg-gradient-to-b from-[#0b0e11] to-[#161a1e] space-y-12">
          <ScannerSection
            title="Short-Term Scale"
            timeframe="15M"
            matches={matches15m}
            tickers={tickers}
            color="emerald"
          />
          <ScannerSection
            title="Intraday Momentum"
            timeframe="1H"
            matches={matches1h}
            tickers={tickers}
            color="blue"
          />
          <ScannerSection
            title="Macro Structure"
            timeframe="4H"
            matches={matches4h}
            tickers={tickers}
            color="indigo"
          />
        </div>
      </main>
    </div>
  );
};

export default App;

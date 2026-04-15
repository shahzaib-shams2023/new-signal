
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchTickers, subscribeToAllTickers, fetchKlines, getRateLimitStatus } from './services/binanceService';
import { checkMomentumStrategy, checkBearishMomentumStrategy } from './services/indicators';
import { notificationService } from './services/notificationService';
import { SymbolInfo, StrategyMatch } from './types';

// Components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ScannerSection from './components/ScannerSection';
import AlertSettings from './components/AlertSettings';

// --- Constants ---
const BLACKLIST = ['ALPACAUSDT', 'BNXUSDT', 'USDCUSDT'];

const App: React.FC = () => {
  const [tickers, setTickers] = useState<SymbolInfo[]>([]);
  const [matches4h, setMatches4h] = useState<StrategyMatch[]>([]);
  const [scanStatus, setScanStatus] = useState<string>('Initializing...');
  const [apiStatus, setApiStatus] = useState(getRateLimitStatus());

  // Notification / Alert settings with Persistence
  const [alertConfig, setAlertConfig] = useState(() => {
    const saved = localStorage.getItem('alert_config');
    return saved ? JSON.parse(saved) : {
      topic: 'bullish_alert_neg',
      enabled: true
    };
  });
  const [showAlertSettings, setShowAlertSettings] = useState(false);

  // Persistence Sync
  useEffect(() => {
    localStorage.setItem('alert_config', JSON.stringify(alertConfig));
    notificationService.configure({
      topic: alertConfig.topic,
      enabled: alertConfig.enabled
    });
  }, [alertConfig]);

  const handleUpdateAlertConfig = useCallback((config: { topic: string; enabled: boolean }) => {
    setAlertConfig(config);
  }, []);

  const scanIndexRef = useRef(0);
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

  // Sidebar List (Volatility Zone)
  const sidebarAssets = useMemo(() => {
    return tickers
      .filter(t => Math.abs(parseFloat(t.priceChangePercent)) >= 10.0)
      .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)));
  }, [tickers]);

  // --- Background Scanner Logic (Optimized Parallel Scanning) ---
  useEffect(() => {
    if (tickers.length === 0 || isScanningRef.current) return;

    isScanningRef.current = true;

    const scanUniverse = [...tickers]
      .filter(t => !BLACKLIST.includes(t.symbol))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 150) // Scan top 150
      .map(t => t.symbol);

    const scanNext = async () => {
      const CHUNK_SIZE = 5;
      const symbolsToScan = [];
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const idx = (scanIndexRef.current + i) % scanUniverse.length;
        symbolsToScan.push(scanUniverse[idx]);
      }

      setScanStatus(symbolsToScan[0] + '...');

      await Promise.all(symbolsToScan.map(async (symbol) => {
        try {
          const candles = await fetchKlines(symbol, '4h', 60);
          const bullMatch = checkMomentumStrategy(symbol, candles, '4h');
          const bearMatch = checkBearishMomentumStrategy(symbol, candles, '4h');

          if (bullMatch && alertConfig.enabled) {
            notificationService.sendBullishAlert(bullMatch);
          }

          if (bullMatch || bearMatch) {
            setMatches4h(prev => {
              const unfiltered = prev.filter(m => m.symbol !== symbol);
              const matches = [];
              if (bullMatch) matches.push(bullMatch);
              if (bearMatch) matches.push(bearMatch);
              return [...matches, ...unfiltered].slice(0, 30);
            });
          }
        } catch (e) {
          // Handled in binanceService
        }
      }));

      scanIndexRef.current = (scanIndexRef.current + CHUNK_SIZE) % scanUniverse.length;
      setTimeout(scanNext, 200);
    };

    scanNext();
    return () => { isScanningRef.current = false; };
  }, [tickers.length > 0, alertConfig.enabled]);

  return (
    <div className="flex h-screen bg-[#0b0e11] text-[#eaecef] font-mono selection:bg-indigo-500 selection:text-white overflow-hidden">

      <Sidebar sidebarAssets={sidebarAssets} />

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <Header
          apiStatus={apiStatus}
          alertEnabled={alertConfig.enabled}
          onShowAlertSettings={() => setShowAlertSettings(!showAlertSettings)}
        />

        <AlertSettings
          config={alertConfig}
          onUpdate={handleUpdateAlertConfig}
          isVisible={showAlertSettings}
        />

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin bg-gradient-to-b from-[#0b0e11] to-[#161a1e]">
          <ScannerSection
            title="Macro Momentum"
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

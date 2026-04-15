
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  price: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

export interface ScreenerAnalysis {
  symbol: string;
  structure: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  pattern: 'HH_HL' | 'LH_LL' | 'CONSOLIDATION';
  lastPivotHigh: number;
  lastPivotLow: number;
  explanation: string;
  timestamp: number;
}

export interface StrategyMatch {
  symbol: string;
  price: number;
  timeframe: string;
  type: 'BULLISH' | 'BEARISH';
  signal: '2_CANDLE_IMPULSE' | '3_CANDLE_IMPULSE';
  pullbackCount: number;
  timestamp: number;
  macd: {
    histogram: number;
    value: number;
  };
  volumeSpike?: boolean;
}


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

export interface StrategyMatch {
  symbol: string;
  price: number;
  timeframe: string;
  type: 'BULLISH' | 'BEARISH';
  signal:
  | 'IMPULSE_BULL'
  | 'IMPULSE_BEAR'
  | 'PARABOLIC_BULL'
  | 'PARABOLIC_BEAR';
  timestamp: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  rsi?: number;
  status?: 'ACTIVE' | 'WIN' | 'LOSS';
  exitPrice?: number;
  exitTimestamp?: number;
}

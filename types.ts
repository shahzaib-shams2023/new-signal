
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
  | 'EMA_CROSS_BULL'
  | 'EMA_CROSS_BEAR'
  | 'MOMENTUM_BULL'
  | 'MOMENTUM_BEAR';
  timestamp: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  rsi?: number;
  status?: 'ACTIVE' | 'WIN' | 'LOSS';
  exitPrice?: number;
  exitTimestamp?: number;
}

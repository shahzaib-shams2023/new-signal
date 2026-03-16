
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
  | 'SCALP_LONG'
  | 'SCALP_SHORT'
  | 'MID_LONG'
  | 'MID_SHORT'
  | 'SWING_LONG'
  | 'SWING_SHORT';
  timestamp: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;

  status?: 'ACTIVE' | 'WIN' | 'LOSS';
  exitPrice?: number;
  exitTimestamp?: number;
}

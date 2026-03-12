
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

export interface FVG {
  type: 'BULLISH' | 'BEARISH';
  upper: number;
  lower: number;
  timestamp: number;
  mitigated: boolean;
}

export interface StrategyMatch {
  symbol: string;
  price: number;
  timeframe: string;
  type: 'BULLISH' | 'BEARISH';
  signal:
  | 'IMPULSE_BULL'
  | 'IMPULSE_BEAR'
  | 'FVG_BULL'
  | 'FVG_BEAR';
  timestamp: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;

  fvg?: FVG;

  status?: 'ACTIVE' | 'WIN' | 'LOSS';
  exitPrice?: number;
  exitTimestamp?: number;
}

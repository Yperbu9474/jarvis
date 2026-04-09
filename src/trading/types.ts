export type TradingMode = 'paper' | 'live';
export type TradingAction = 'LONG' | 'SHORT' | 'HOLD';
export type PositionStatus = 'open' | 'closed';

export interface TradingConfig {
  enabled: boolean;
  mode: TradingMode;
  allowLiveExecution: boolean;
  symbols: string[];
  scanAllUsdtMarkets: boolean;
  maxMarketScan: number;
  setupsPerRun: number;
  intervalMinutes: number;
  marginCoin: string;
  paperBalance: number;
  maxLeverage: number;
  maxNotionalPerTrade: number;
  maxConcurrentPositions: number;
  maxDailyLoss: number;
  riskPerTradePct: number;
  maxHoldMinutes: number;
  apiKey: string;
  apiSecret: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  quoteVol?: number;
  baseVol?: number;
}

export interface SignalIndicators {
  fastEma: number;
  slowEma: number;
  rsi: number;
  momentumPct: number;
  volatilityPct: number;
  trendStrength: number;
  triggerStrength: number;
  volumeImpulse: number;
  efficiency: number;
  extensionPct: number;
  breakoutBias: number;
}

export interface TradingAnalysis {
  symbol: string;
  action: TradingAction;
  confidence: number;
  price: number;
  takeProfit: number | null;
  stopLoss: number | null;
  leverage: number;
  rationale: string;
  indicators: SignalIndicators;
  analyzedAt: number;
}

export interface TradingRun {
  id: string;
  mode: TradingMode;
  trigger: 'manual' | 'scheduler';
  status: 'completed' | 'blocked' | 'failed';
  summary: string;
  createdAt: number;
}

export interface TradingSignalRecord extends TradingAnalysis {
  id: string;
  runId: string | null;
}

export interface TradingPosition {
  id: string;
  symbol: string;
  mode: TradingMode;
  side: 'LONG' | 'SHORT';
  status: PositionStatus;
  leverage: number;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notional: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: number;
  closedAt: number | null;
  closePrice: number | null;
  meta: Record<string, unknown>;
}

export interface TradingOrder {
  id: string;
  positionId: string | null;
  signalId: string | null;
  provider: 'paper' | 'bitunix';
  providerOrderId: string | null;
  symbol: string;
  mode: TradingMode;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET';
  status: 'simulated' | 'submitted' | 'rejected' | 'closed';
  leverage: number;
  quantity: number;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  pnlSnapshot: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TradingSummary {
  config: TradingConfig;
  accountEquity: number;
  accountAvailable: number;
  dayPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  openPositions: TradingPosition[];
  recentOrders: TradingOrder[];
  recentSignals: TradingSignalRecord[];
  recentRuns: TradingRun[];
}

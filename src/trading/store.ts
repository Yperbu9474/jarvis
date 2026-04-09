import { generateId, getDb } from '../vault/schema.ts';
import { getSetting, setSetting } from '../vault/settings.ts';
import type {
  TradingAnalysis,
  TradingConfig,
  TradingOrder,
  TradingPosition,
  TradingRun,
  TradingSignalRecord,
} from './types.ts';

const DEFAULT_CONFIG: TradingConfig = {
  enabled: true,
  mode: 'paper',
  allowLiveExecution: false,
  symbols: ['BTCUSDT', 'ETHUSDT'],
  scanAllUsdtMarkets: true,
  maxMarketScan: 8,
  setupsPerRun: 2,
  intervalMinutes: 1,
  marginCoin: 'USDT',
  paperBalance: 10000,
  maxLeverage: 5,
  maxNotionalPerTrade: 1500,
  maxConcurrentPositions: 3,
  maxDailyLoss: 400,
  riskPerTradePct: 0.01,
  maxHoldMinutes: 20,
  apiKey: '',
  apiSecret: '',
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return { ...fallback, ...JSON.parse(value) };
  } catch {
    return fallback;
  }
}

export function getTradingConfig(): TradingConfig {
  const parsed = parseJson<TradingConfig>(getSetting('trading.config'), DEFAULT_CONFIG);
  const envApiKey = process.env.JARVIS_BITUNIX_API_KEY?.trim();
  const envApiSecret = process.env.JARVIS_BITUNIX_API_SECRET?.trim();
  const symbols = Array.isArray(parsed.symbols)
    ? parsed.symbols.map((symbol) => `${symbol}`.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_CONFIG.symbols;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    symbols: symbols.length > 0 ? symbols : DEFAULT_CONFIG.symbols,
    scanAllUsdtMarkets: Boolean(parsed.scanAllUsdtMarkets ?? DEFAULT_CONFIG.scanAllUsdtMarkets),
    maxMarketScan: Math.max(5, Math.min(100, Number(parsed.maxMarketScan) || DEFAULT_CONFIG.maxMarketScan)),
    setupsPerRun: Math.max(1, Math.min(10, Number(parsed.setupsPerRun) || DEFAULT_CONFIG.setupsPerRun)),
    intervalMinutes: Math.max(1, Math.min(60, Number(parsed.intervalMinutes) || DEFAULT_CONFIG.intervalMinutes)),
    paperBalance: Math.max(100, Number(parsed.paperBalance) || DEFAULT_CONFIG.paperBalance),
    maxLeverage: Math.max(1, Math.min(25, Number(parsed.maxLeverage) || DEFAULT_CONFIG.maxLeverage)),
    maxNotionalPerTrade: Math.max(1, Number(parsed.maxNotionalPerTrade) || DEFAULT_CONFIG.maxNotionalPerTrade),
    maxConcurrentPositions: Math.max(1, Math.min(10, Number(parsed.maxConcurrentPositions) || DEFAULT_CONFIG.maxConcurrentPositions)),
    maxDailyLoss: Math.max(25, Number(parsed.maxDailyLoss) || DEFAULT_CONFIG.maxDailyLoss),
    riskPerTradePct: Math.max(0.001, Math.min(0.05, Number(parsed.riskPerTradePct) || DEFAULT_CONFIG.riskPerTradePct)),
    maxHoldMinutes: Math.max(1, Math.min(240, Number(parsed.maxHoldMinutes) || DEFAULT_CONFIG.maxHoldMinutes)),
    apiKey: envApiKey || `${parsed.apiKey ?? DEFAULT_CONFIG.apiKey}`,
    apiSecret: envApiSecret || `${parsed.apiSecret ?? DEFAULT_CONFIG.apiSecret}`,
  };
}

export function saveTradingConfig(input: Partial<TradingConfig>): TradingConfig {
  const next = {
    ...getTradingConfig(),
    ...input,
  };
  setSetting('trading.config', JSON.stringify(next));
  return getTradingConfig();
}

function decodePosition(row: any): TradingPosition {
  return {
    id: row.id,
    symbol: row.symbol,
    mode: row.mode,
    side: row.side,
    status: row.status,
    leverage: Number(row.leverage),
    quantity: Number(row.quantity),
    entryPrice: Number(row.entry_price),
    currentPrice: Number(row.current_price),
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    takeProfit: row.take_profit == null ? null : Number(row.take_profit),
    notional: Number(row.notional),
    unrealizedPnl: Number(row.unrealized_pnl),
    realizedPnl: Number(row.realized_pnl),
    openedAt: Number(row.opened_at),
    closedAt: row.closed_at == null ? null : Number(row.closed_at),
    closePrice: row.close_price == null ? null : Number(row.close_price),
    meta: row.meta ? JSON.parse(row.meta) : {},
  };
}

function decodeOrder(row: any): TradingOrder {
  return {
    id: row.id,
    positionId: row.position_id,
    signalId: row.signal_id,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    symbol: row.symbol,
    mode: row.mode,
    side: row.side,
    orderType: row.order_type,
    status: row.status,
    leverage: Number(row.leverage),
    quantity: Number(row.quantity),
    price: Number(row.price),
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    takeProfit: row.take_profit == null ? null : Number(row.take_profit),
    pnlSnapshot: row.pnl_snapshot == null ? null : Number(row.pnl_snapshot),
    errorMessage: row.error_message,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function decodeSignal(row: any): TradingSignalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    symbol: row.symbol,
    action: row.action,
    confidence: Number(row.confidence),
    price: Number(row.price),
    takeProfit: row.take_profit == null ? null : Number(row.take_profit),
    stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    leverage: Number(row.leverage),
    rationale: row.rationale,
    indicators: row.indicators_json ? JSON.parse(row.indicators_json) : {},
    analyzedAt: Number(row.created_at),
  };
}

export function createTradingRun(input: Omit<TradingRun, 'id'>): TradingRun {
  const db = getDb();
  const id = generateId();
  db.run(
    `INSERT INTO trading_runs (id, mode, trigger, status, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.mode, input.trigger, input.status, input.summary, input.createdAt],
  );
  return { id, ...input };
}

export function listTradingRuns(limit = 20): TradingRun[] {
  const db = getDb();
  return db.query(
    `SELECT * FROM trading_runs ORDER BY created_at DESC LIMIT ?`,
  ).all(limit).map((row: any) => ({
    id: row.id,
    mode: row.mode,
    trigger: row.trigger,
    status: row.status,
    summary: row.summary,
    createdAt: Number(row.created_at),
  }));
}

export function createSignal(runId: string | null, analysis: TradingAnalysis): TradingSignalRecord {
  const db = getDb();
  const id = generateId();
  db.run(
    `INSERT INTO trading_signals (
      id, run_id, symbol, action, confidence, price, take_profit, stop_loss,
      leverage, rationale, indicators_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      runId,
      analysis.symbol,
      analysis.action,
      analysis.confidence,
      analysis.price,
      analysis.takeProfit,
      analysis.stopLoss,
      analysis.leverage,
      analysis.rationale,
      JSON.stringify(analysis.indicators),
      analysis.analyzedAt,
    ],
  );
  return { id, runId, ...analysis };
}

export function listSignals(limit = 20): TradingSignalRecord[] {
  const db = getDb();
  return db.query(
    `SELECT * FROM trading_signals ORDER BY created_at DESC LIMIT ?`,
  ).all(limit).map(decodeSignal);
}

export function createPosition(input: Omit<TradingPosition, 'id'>): TradingPosition {
  const db = getDb();
  const id = generateId();
  db.run(
    `INSERT INTO trading_positions (
      id, symbol, mode, side, status, leverage, quantity, entry_price, current_price,
      stop_loss, take_profit, notional, unrealized_pnl, realized_pnl, opened_at,
      closed_at, close_price, meta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.symbol,
      input.mode,
      input.side,
      input.status,
      input.leverage,
      input.quantity,
      input.entryPrice,
      input.currentPrice,
      input.stopLoss,
      input.takeProfit,
      input.notional,
      input.unrealizedPnl,
      input.realizedPnl,
      input.openedAt,
      input.closedAt,
      input.closePrice,
      JSON.stringify(input.meta),
    ],
  );
  return { id, ...input };
}

export function updatePosition(position: TradingPosition): void {
  const db = getDb();
  db.run(
    `UPDATE trading_positions
     SET side = ?, current_price = ?, stop_loss = ?, take_profit = ?, unrealized_pnl = ?, realized_pnl = ?,
         status = ?, closed_at = ?, close_price = ?, meta = ?
     WHERE id = ?`,
    [
      position.side,
      position.currentPrice,
      position.stopLoss,
      position.takeProfit,
      position.unrealizedPnl,
      position.realizedPnl,
      position.status,
      position.closedAt,
      position.closePrice,
      JSON.stringify(position.meta),
      position.id,
    ],
  );
}

export function listPositions(status?: 'open' | 'closed', limit = 100): TradingPosition[] {
  const db = getDb();
  if (status) {
    return db.query(
      `SELECT * FROM trading_positions WHERE status = ? ORDER BY opened_at DESC LIMIT ?`,
    ).all(status, limit).map(decodePosition);
  }
  return db.query(
    `SELECT * FROM trading_positions ORDER BY opened_at DESC LIMIT ?`,
  ).all(limit).map(decodePosition);
}

export function getOpenPositionBySymbol(symbol: string, mode: TradingConfig['mode']): TradingPosition | null {
  const db = getDb();
  const row = db.query(
    `SELECT * FROM trading_positions
     WHERE symbol = ? AND mode = ? AND status = 'open'
     ORDER BY opened_at DESC LIMIT 1`,
  ).get(symbol, mode);
  return row ? decodePosition(row) : null;
}

export function createOrder(input: Omit<TradingOrder, 'id'>): TradingOrder {
  const db = getDb();
  const id = generateId();
  db.run(
    `INSERT INTO trading_orders (
      id, position_id, signal_id, provider, provider_order_id, symbol, mode, side, order_type,
      status, leverage, quantity, price, stop_loss, take_profit, pnl_snapshot, error_message,
      raw_response, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.positionId,
      input.signalId,
      input.provider,
      input.providerOrderId,
      input.symbol,
      input.mode,
      input.side,
      input.orderType,
      input.status,
      input.leverage,
      input.quantity,
      input.price,
      input.stopLoss,
      input.takeProfit,
      input.pnlSnapshot,
      input.errorMessage,
      null,
      input.createdAt,
      input.updatedAt,
    ],
  );
  return { id, ...input };
}

export function listOrders(limit = 50): TradingOrder[] {
  const db = getDb();
  return db.query(
    `SELECT * FROM trading_orders ORDER BY created_at DESC LIMIT ?`,
  ).all(limit).map(decodeOrder);
}

export function getPnlRows(limit = 200): TradingPosition[] {
  return listPositions(undefined, limit);
}

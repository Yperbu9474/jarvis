import { BitunixClient } from './bitunix-client.ts';
import { getSetting } from '../vault/settings.ts';
import {
  createOrder,
  createPosition,
  createSignal,
  createTradingRun,
  getOpenPositionBySymbol,
  getPnlRows,
  getTradingConfig,
  listOrders,
  listPositions,
  listSignals,
  listTradingRuns,
  saveTradingConfig,
  updatePosition,
} from './store.ts';
import type {
  Candle,
  TradingAnalysis,
  TradingConfig,
  TradingPosition,
  TradingSummary,
} from './types.ts';

type TradingSummaryOverrides = Partial<Pick<
  TradingSummary,
  'accountEquity' | 'accountAvailable' | 'dayPnl' | 'realizedPnl' | 'unrealizedPnl' | 'winRate'
>>;

function getTradingSummaryOverrides(): TradingSummaryOverrides | null {
  const raw = getSetting('trading.mockSummary');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      accountEquity: parsed.accountEquity == null ? undefined : Number(parsed.accountEquity),
      accountAvailable: parsed.accountAvailable == null ? undefined : Number(parsed.accountAvailable),
      dayPnl: parsed.dayPnl == null ? undefined : Number(parsed.dayPnl),
      realizedPnl: parsed.realizedPnl == null ? undefined : Number(parsed.realizedPnl),
      unrealizedPnl: parsed.unrealizedPnl == null ? undefined : Number(parsed.unrealizedPnl),
      winRate: parsed.winRate == null ? undefined : Number(parsed.winRate),
    };
  } catch {
    return null;
  }
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let current = values[0] ?? 0;
  for (let index = 1; index < values.length; index += 1) {
    current = values[index]! * k + current * (1 - k);
  }
  return current;
}

function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function averageRangePct(candles: Candle[]): number {
  const ranges = candles.slice(-20).map((candle) => (candle.high - candle.low) / candle.close);
  return ranges.reduce((sum, value) => sum + value, 0) / Math.max(1, ranges.length);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function highest(values: number[]): number {
  return values.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
}

function lowest(values: number[]): number {
  return values.reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY);
}

function efficiencyRatio(values: number[], lookback = 20): number {
  if (values.length < lookback + 1) return 0;
  const window = values.slice(-lookback - 1);
  const directional = Math.abs(latest(window) - window[0]!);
  const path = window.slice(1).reduce((acc, value, index) => acc + Math.abs(value - window[index]!), 0);
  return path > 0 ? directional / path : 0;
}

function averageVolume(candles: Candle[], lookback: number, offset = 0): number {
  const slice = candles.slice(-(lookback + offset), offset === 0 ? undefined : -offset);
  const values = slice.map((candle) => Number(candle.quoteVol ?? candle.baseVol ?? 0)).filter((value) => value > 0);
  return average(values);
}

function latest<T>(values: T[]): T {
  return values[values.length - 1]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pnlForPosition(position: TradingPosition, price: number): number {
  const direction = position.side === 'LONG' ? 1 : -1;
  return (price - position.entryPrice) * position.quantity * direction;
}

function roiPctForPosition(position: TradingPosition, pnl: number): number {
  const initialMargin = position.leverage > 0 ? position.notional / position.leverage : position.notional;
  if (initialMargin <= 0) return 0;
  return (pnl / initialMargin) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const CORE_USDT_MARKETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT'];

export class TradingService {
  private timer: Timer | null = null;

  private findLatestOrderForSymbol(symbol: string, mode: TradingConfig['mode']) {
    return listOrders(500).find((order) => order.symbol === symbol && order.mode === mode);
  }

  private async resolveLivePositionId(
    client: BitunixClient,
    symbol: string,
    side: TradingAnalysis['action'],
  ): Promise<string | null> {
    const expectedSide = side === 'SHORT' ? 'SHORT' : 'LONG';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sleep(500);
      const pending = await client.getPendingPositions(symbol).catch(() => []);
      const match = pending.find((position) => {
        const remoteSymbol = `${position.symbol ?? ''}`;
        const remoteSide = `${position.side ?? ''}`.toUpperCase();
        const remoteQty = Number(position.qty ?? position.volume ?? 0);
        return remoteSymbol === symbol && remoteSide === expectedSide && remoteQty > 0;
      });
      const positionId = `${match?.positionId ?? ''}`.trim();
      if (positionId) return positionId;
    }
    return null;
  }

  private upsertLivePositionFromEntry(
    analysis: TradingAnalysis,
    quantity: number,
    providerPositionId: string | null,
  ): TradingPosition {
    const existing = getOpenPositionBySymbol(analysis.symbol, 'live');
    if (existing) {
      existing.side = analysis.action === 'SHORT' ? 'SHORT' : 'LONG';
      existing.leverage = analysis.leverage;
      existing.quantity = quantity;
      existing.entryPrice = analysis.price;
      existing.currentPrice = analysis.price;
      existing.stopLoss = analysis.stopLoss;
      existing.takeProfit = analysis.takeProfit;
      existing.notional = quantity * analysis.price;
      existing.meta = {
        ...existing.meta,
        providerPositionId,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        confidence: analysis.confidence,
        rationale: analysis.rationale,
      };
      updatePosition(existing);
      return existing;
    }
    return createPosition({
      symbol: analysis.symbol,
      mode: 'live',
      side: analysis.action === 'SHORT' ? 'SHORT' : 'LONG',
      status: 'open',
      leverage: analysis.leverage,
      quantity,
      entryPrice: analysis.price,
      currentPrice: analysis.price,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      notional: quantity * analysis.price,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openedAt: Date.now(),
      closedAt: null,
      closePrice: null,
      meta: {
        providerPositionId,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        confidence: analysis.confidence,
        rationale: analysis.rationale,
      },
    });
  }

  private async closeLivePosition(
    position: TradingPosition,
    price: number,
    reason: 'stop_loss' | 'take_profit' | 'time_exit',
  ): Promise<void> {
    const config = getTradingConfig();
    if (config.mode !== 'live' || !config.apiKey || !config.apiSecret) return;
    const client = this.getClient(config);
    const side = position.side === 'LONG' ? 'SELL' : 'BUY';
    const providerPositionId = `${position.meta.providerPositionId ?? ''}`.trim() || null;
    try {
      const response = await client.placeCloseOrder({
        positionId: providerPositionId,
        symbol: position.symbol,
        side,
        quantity: position.quantity,
      });
      position.currentPrice = price;
      position.closePrice = price;
      position.closedAt = Date.now();
      position.status = 'closed';
      position.realizedPnl = pnlForPosition(position, price);
      position.unrealizedPnl = 0;
      updatePosition(position);
      createOrder({
        positionId: position.id,
        signalId: null,
        provider: 'bitunix',
        providerOrderId: `${response.orderId ?? response.clientId ?? ''}` || null,
        symbol: position.symbol,
        mode: 'live',
        side,
        orderType: 'MARKET',
        status: 'closed',
        leverage: position.leverage,
        quantity: position.quantity,
        price,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        pnlSnapshot: position.realizedPnl,
        errorMessage: reason === 'stop_loss'
          ? 'Closed by live stop-loss fallback.'
          : reason === 'take_profit'
            ? 'Closed by live take-profit fallback.'
            : 'Closed by max hold time.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      createOrder({
        positionId: position.id,
        signalId: null,
        provider: 'bitunix',
        providerOrderId: null,
        symbol: position.symbol,
        mode: 'live',
        side,
        orderType: 'MARKET',
        status: 'rejected',
        leverage: position.leverage,
        quantity: position.quantity,
        price,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        pnlSnapshot: null,
        errorMessage: `Fallback close failed: ${error instanceof Error ? error.message : `${error}`}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  private async attachLiveProtection(
    client: BitunixClient,
    position: TradingPosition,
    takeProfit: number | null,
    stopLoss: number | null,
  ): Promise<boolean> {
    const providerPositionId = `${position.meta.providerPositionId ?? ''}`.trim();
    if (!providerPositionId || (takeProfit == null && stopLoss == null)) return false;
    await client.placePositionTpSlOrder({
      symbol: position.symbol,
      positionId: providerPositionId,
      takeProfit,
      stopLoss,
    });
    position.stopLoss = stopLoss;
    position.takeProfit = takeProfit;
    position.meta = {
      ...position.meta,
      stopLoss,
      takeProfit,
      tpSlAttached: true,
      tpSlAttachedAt: Date.now(),
    };
    updatePosition(position);
    return true;
  }

  private normalizeProtectionLevels(
    side: TradingPosition['side'],
    currentPrice: number,
    takeProfit: number | null,
    stopLoss: number | null,
  ): { takeProfit: number | null; stopLoss: number | null } {
    const defaultStopPct = 0.004;
    const defaultTargetPct = 0.0075;
    const safeCurrent = currentPrice > 0 ? currentPrice : 0;
    if (safeCurrent <= 0) {
      return { takeProfit, stopLoss };
    }

    let nextStop = stopLoss;
    let nextTarget = takeProfit;

    if (side === 'LONG') {
      if (nextStop == null || nextStop >= safeCurrent) nextStop = safeCurrent * (1 - defaultStopPct);
      if (nextTarget == null || nextTarget <= safeCurrent) nextTarget = safeCurrent * (1 + defaultTargetPct);
    } else {
      if (nextStop == null || nextStop <= safeCurrent) nextStop = safeCurrent * (1 + defaultStopPct);
      if (nextTarget == null || nextTarget >= safeCurrent) nextTarget = safeCurrent * (1 - defaultTargetPct);
    }

    return {
      stopLoss: nextStop,
      takeProfit: nextTarget,
    };
  }

  private hasExceededMaxHold(position: TradingPosition, config: TradingConfig): boolean {
    const maxHoldMs = config.maxHoldMinutes * 60 * 1000;
    return maxHoldMs > 0 && Date.now() - position.openedAt >= maxHoldMs;
  }

  private shouldCloseForTimedExit(position: TradingPosition, price: number, config: TradingConfig): boolean {
    if (!this.hasExceededMaxHold(position, config)) return false;
    const pnl = pnlForPosition(position, price);
    const roiPct = roiPctForPosition(position, pnl);
    return roiPct >= 0.5;
  }

  private async enforceLiveRiskControls(priceBySymbol: Map<string, number>): Promise<void> {
    const config = getTradingConfig();
    const openPositions = this.getOpenPositionsForMode('live');
    for (const position of openPositions) {
      const price = priceBySymbol.get(position.symbol);
      if (!price) continue;
      const hitTimeExit = this.shouldCloseForTimedExit(position, price, config);
      const hitStop = position.stopLoss != null && (
        (position.side === 'LONG' && price <= position.stopLoss) ||
        (position.side === 'SHORT' && price >= position.stopLoss)
      );
      const hitTarget = position.takeProfit != null && (
        (position.side === 'LONG' && price >= position.takeProfit) ||
        (position.side === 'SHORT' && price <= position.takeProfit)
      );
      if (hitStop) {
        await this.closeLivePosition(position, price, 'stop_loss');
      } else if (hitTarget) {
        await this.closeLivePosition(position, price, 'take_profit');
      } else if (hitTimeExit) {
        await this.closeLivePosition(position, price, 'time_exit');
      }
    }
  }

  private getOpenPositionsForMode(mode: TradingConfig['mode']): TradingPosition[] {
    return listPositions('open', 200).filter((position) => position.mode === mode);
  }

  private async getTradingPairMap(config: TradingConfig): Promise<Map<string, Record<string, string | number>>> {
    const client = this.getClient(config);
    const pairs = await client.getTradingPairs();
    return new Map(pairs.map((pair) => [`${pair.symbol}`, pair]));
  }

  private computeOrderQuantity(
    analysis: TradingAnalysis,
    config: TradingConfig,
    pairMeta?: Record<string, string | number>,
  ): number {
    const rawQty = config.maxNotionalPerTrade / analysis.price;
    const minQty = Number(pairMeta?.minTradeVolume ?? 0);
    const precision = Number(pairMeta?.basePrecision ?? 4);
    const factor = 10 ** Math.max(0, precision);
    const rounded = Math.floor(rawQty * factor) / factor;
    if (minQty > 0 && rounded < minQty) return 0;
    return Number(rounded.toFixed(Math.max(0, precision)));
  }

  start(): void {
    this.refreshScheduler();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refreshScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const config = getTradingConfig();
    if (!config.enabled) return;
    const intervalMs = config.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      this.runCycle('scheduler').catch((error) => {
        console.error('[Trading] Scheduled cycle failed:', error);
      });
    }, intervalMs);
  }

  getConfig(): TradingConfig {
    return getTradingConfig();
  }

  saveConfig(next: Partial<TradingConfig>): TradingConfig {
    const config = saveTradingConfig(next);
    this.refreshScheduler();
    return config;
  }

  private getClient(config = getTradingConfig()): BitunixClient {
    return new BitunixClient(config.apiKey, config.apiSecret);
  }

  private async discoverSymbols(config: TradingConfig): Promise<string[]> {
    if (!config.scanAllUsdtMarkets) {
      const requested = config.symbols.filter((symbol) => CORE_USDT_MARKETS.includes(symbol));
      return requested.length > 0 ? requested : CORE_USDT_MARKETS.slice(0, Math.max(3, config.maxMarketScan));
    }
    const client = this.getClient(config);
    const pairs = await client.getTradingPairs();
    const usdtPairs = pairs
      .filter((pair) => pair.quote === 'USDT' && pair.symbolStatus === 'OPEN')
      .map((pair) => `${pair.symbol}`);
    const tickers = await client.getTickers(usdtPairs);
    const ranked = tickers
      .map((ticker) => ({
        symbol: `${ticker.symbol}`,
        quoteVol: Number(ticker.quoteVol ?? 0),
      }))
      .filter((ticker) => CORE_USDT_MARKETS.includes(ticker.symbol))
      .sort((a, b) => b.quoteVol - a.quoteVol)
      .slice(0, config.maxMarketScan)
      .map((ticker) => ticker.symbol);
    return ranked.length > 0 ? ranked : CORE_USDT_MARKETS.slice(0, Math.max(3, config.maxMarketScan));
  }

  async analyzeSymbol(symbol: string): Promise<TradingAnalysis> {
    const config = getTradingConfig();
    const client = this.getClient(config);
    const candles5m = await client.getKlines(symbol, '5m', 120);
    await sleep(180);
    const candles15m = await client.getKlines(symbol, '15m', 120);
    await sleep(180);
    const candles1h = await client.getKlines(symbol, '1h', 120);
    if (candles15m.length < 40 || candles1h.length < 40 || candles5m.length < 40) {
      throw new Error(`Not enough market data for ${symbol}`);
    }
    const closes = candles15m.map((candle) => candle.close);
    const closes1h = candles1h.map((candle) => candle.close);
    const closes5m = candles5m.map((candle) => candle.close);
    const price = closes[closes.length - 1]!;
    const fastEma = ema(closes.slice(-21), 8);
    const slowEma = ema(closes.slice(-55), 21);
    const trend1h = (ema(closes1h.slice(-34), 13) - ema(closes1h.slice(-89), 34)) / latest(closes1h);
    const trigger5m = (ema(closes5m.slice(-13), 5) - ema(closes5m.slice(-34), 13)) / latest(closes5m);
    const currentRsi = rsi(closes, 14);
    const momentumPct = ((price / closes[closes.length - 7]!) - 1) * 100;
    const volatilityPct = averageRangePct(candles15m) * 100;

    const trendScore = (fastEma - slowEma) / price;
    const trendStrength = Math.abs(trend1h) + Math.abs(trendScore);
    const triggerStrength = Math.abs(trigger5m);
    const directionBias = trend1h + trendScore * 0.9 + trigger5m * 0.75;
    const efficiency = (efficiencyRatio(closes, 20) + efficiencyRatio(closes1h, 18)) / 2;
    const quoteVolumeFast = averageVolume(candles15m, 8);
    const quoteVolumeSlow = averageVolume(candles15m, 24, 8);
    const volumeImpulse = quoteVolumeSlow > 0 ? (quoteVolumeFast / quoteVolumeSlow) - 1 : 0;
    const recentHigh = highest(candles15m.slice(-20).map((candle) => candle.high));
    const recentLow = lowest(candles15m.slice(-20).map((candle) => candle.low));
    const breakoutBias = recentHigh > recentLow ? ((price - recentLow) / (recentHigh - recentLow)) - 0.5 : 0;
    const extensionPct = Math.abs(price - fastEma) / price;
    const momentumScore = momentumPct / 4;
    const rsiBias = currentRsi > 58 ? 0.28 : currentRsi < 42 ? -0.28 : 0;
    const regimePenalty = efficiency < 0.18 && trendStrength < 0.006 ? 0.22 : 0;
    const extensionPenalty = extensionPct > 0.012 ? (extensionPct - 0.012) * 14 : 0;
    const volumeBonus = clamp(volumeImpulse, -0.35, 0.65);
    const breakoutScore = breakoutBias * 1.4;
    const composite = (
      directionBias * 135 +
      momentumScore +
      rsiBias +
      efficiency * 1.1 +
      volumeBonus * 0.7 +
      breakoutScore -
      regimePenalty -
      extensionPenalty
    );
    const longConditions = [
      directionBias > 0.002,
      currentRsi >= 46 && currentRsi <= 72,
      efficiency >= 0.16,
      breakoutBias > -0.12,
      extensionPct <= 0.018,
    ];
    const shortConditions = [
      directionBias < -0.002,
      currentRsi <= 54 && currentRsi >= 28,
      efficiency >= 0.16,
      breakoutBias < 0.12,
      extensionPct <= 0.018,
    ];
    const longPass = longConditions.filter(Boolean).length;
    const shortPass = shortConditions.filter(Boolean).length;

    let action: TradingAnalysis['action'] = 'HOLD';
    if (composite > 0.52 && longPass >= 4) action = 'LONG';
    else if (composite < -0.52 && shortPass >= 4) action = 'SHORT';
    else if (composite > 0.28 && longPass >= 3 && volumeImpulse > -0.18) action = 'LONG';
    else if (composite < -0.28 && shortPass >= 3 && volumeImpulse > -0.18) action = 'SHORT';

    const confidenceBase = Math.abs(composite) / 2.6;
    const confidence = clamp(
      confidenceBase + efficiency * 0.24 + Math.max(0, volumeImpulse) * 0.12 - extensionPenalty * 0.25,
      0.08,
      0.98,
    );
    const stopDistancePct = clamp((volatilityPct / 100) * (0.82 + (1 - efficiency) * 0.45), 0.0025, 0.011);
    const takeDistancePct = clamp(stopDistancePct * (1.45 + Math.max(0, efficiency - 0.2) * 0.9), 0.004, 0.02);
    const stopLoss = action === 'LONG'
      ? price * (1 - stopDistancePct)
      : action === 'SHORT'
        ? price * (1 + stopDistancePct)
        : null;
    const takeProfit = action === 'LONG'
      ? price * (1 + takeDistancePct)
      : action === 'SHORT'
        ? price * (1 - takeDistancePct)
        : null;
    const leverage = clamp(Math.round(1 + confidence * config.maxLeverage * 0.8), 1, config.maxLeverage);
    const regime = efficiency >= 0.24 ? 'trending' : efficiency >= 0.16 ? 'transitional' : 'choppy';
    const rationale = action === 'HOLD'
      ? `${symbol} is ${regime} but not clean enough: ${currentRsi.toFixed(0)} RSI, ${(volumeImpulse * 100).toFixed(1)}% volume impulse, and ${(extensionPct * 100).toFixed(2)}% extension from trend basis.`
      : `${symbol} has ${action === 'LONG' ? 'bullish' : 'bearish'} multi-timeframe alignment with ${regime} structure, ${currentRsi.toFixed(0)} RSI, ${(volumeImpulse * 100).toFixed(1)}% volume impulse, and ${(efficiency * 100).toFixed(1)} trend efficiency.`;

    return {
      symbol,
      action,
      confidence,
      price,
      takeProfit,
      stopLoss,
      leverage,
      rationale,
      indicators: {
        fastEma,
        slowEma,
        rsi: currentRsi,
        momentumPct,
        volatilityPct,
        trendStrength,
        triggerStrength,
        volumeImpulse,
        efficiency,
        extensionPct,
        breakoutBias,
      },
      analyzedAt: Date.now(),
    };
  }

  private getAccountEquity(config = getTradingConfig()): number {
    const positions = listPositions(undefined, 500);
    const realized = positions.reduce((sum, position) => sum + position.realizedPnl, 0);
    const open = positions.filter((position) => position.status === 'open');
    const unrealized = open.reduce((sum, position) => sum + position.unrealizedPnl, 0);
    return config.paperBalance + realized + unrealized;
  }

  private async getLiveAccountSnapshot(config: TradingConfig): Promise<{ equity: number; available: number; unrealized: number }> {
    const client = this.getClient(config);
    const account = await client.getAccount(config.marginCoin);
    const available = Number(account?.available ?? 0);
    const cross = Number(account?.crossUnrealizedPNL ?? account?.crossUnrealizedPnl ?? 0);
    const isolation = Number(account?.isolationUnrealizedPNL ?? account?.isolationUnrealizedPnl ?? 0);
    const margin = Number(account?.margin ?? account?.balance ?? 0);
    return {
      available,
      unrealized: cross + isolation,
      equity: available + margin + cross + isolation,
    };
  }

  private toLocalPositionSide(remoteSide: unknown): TradingPosition['side'] {
    const normalized = `${remoteSide ?? ''}`.toUpperCase();
    return normalized === 'SELL' || normalized === 'SHORT' ? 'SHORT' : 'LONG';
  }

  private getDailyRealizedLoss(): number {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return listPositions('closed', 500)
      .filter((position) => (position.closedAt ?? 0) >= since)
      .reduce((sum, position) => sum + Math.min(0, position.realizedPnl), 0);
  }

  private updateOpenPositionMarks(priceBySymbol: Map<string, number>): void {
    const config = getTradingConfig();
    const openPositions = this.getOpenPositionsForMode('paper');
    for (const position of openPositions) {
      const price = priceBySymbol.get(position.symbol);
      if (!price) continue;
      position.currentPrice = price;
      position.unrealizedPnl = pnlForPosition(position, price);
      const hitTimeExit = this.shouldCloseForTimedExit(position, price, config);
      const hitStop = position.stopLoss != null && (
        (position.side === 'LONG' && price <= position.stopLoss) ||
        (position.side === 'SHORT' && price >= position.stopLoss)
      );
      const hitTarget = position.takeProfit != null && (
        (position.side === 'LONG' && price >= position.takeProfit) ||
        (position.side === 'SHORT' && price <= position.takeProfit)
      );
      if (hitStop || hitTarget || hitTimeExit) {
        position.status = 'closed';
        position.closePrice = price;
        position.closedAt = Date.now();
        position.realizedPnl = position.unrealizedPnl;
        createOrder({
          positionId: position.id,
          signalId: null,
          provider: 'paper',
          providerOrderId: null,
          symbol: position.symbol,
          mode: position.mode,
          side: position.side === 'LONG' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          status: 'closed',
          leverage: position.leverage,
          quantity: position.quantity,
          price,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          pnlSnapshot: position.realizedPnl,
          errorMessage: hitTimeExit ? 'Closed by max hold time.' : null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      updatePosition(position);
    }
  }

  private openPaperPosition(
    signalId: string,
    analysis: TradingAnalysis,
    config: TradingConfig,
    pairMeta?: Record<string, string | number>,
  ): string {
    const equity = this.getAccountEquity(config);
    const openPositions = this.getOpenPositionsForMode(config.mode);
    if (openPositions.length >= config.maxConcurrentPositions) {
      return `Skipped ${analysis.symbol}: concurrent position cap reached.`;
    }
    if (Math.abs(this.getDailyRealizedLoss()) >= config.maxDailyLoss) {
      return `Skipped ${analysis.symbol}: daily loss limit reached.`;
    }
    if (getOpenPositionBySymbol(analysis.symbol, config.mode)) {
      return `Skipped ${analysis.symbol}: position already open.`;
    }
    if (analysis.action === 'HOLD' || analysis.stopLoss == null || analysis.takeProfit == null) {
      return `Held ${analysis.symbol}: no high-conviction entry.`;
    }

    const riskBudget = equity * config.riskPerTradePct;
    const stopDistance = Math.abs(analysis.price - analysis.stopLoss);
    const quantityFromRisk = stopDistance > 0 ? riskBudget / stopDistance : 0;
    const quantityFromNotional = this.computeOrderQuantity(analysis, config, pairMeta);
    const quantity = Number(Math.max(0, Math.min(quantityFromRisk, quantityFromNotional)).toFixed(5));
    if (quantity <= 0) {
      return `Skipped ${analysis.symbol}: account size is below Bitunix minimum trade size.`;
    }

    const position = createPosition({
      symbol: analysis.symbol,
      mode: config.mode,
      side: analysis.action,
      status: 'open',
      leverage: analysis.leverage,
      quantity,
      entryPrice: analysis.price,
      currentPrice: analysis.price,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      notional: quantity * analysis.price,
      unrealizedPnl: 0,
      realizedPnl: 0,
      openedAt: Date.now(),
      closedAt: null,
      closePrice: null,
      meta: { confidence: analysis.confidence, rationale: analysis.rationale },
    });

    createOrder({
      positionId: position.id,
      signalId,
      provider: 'paper',
      providerOrderId: null,
      symbol: analysis.symbol,
      mode: config.mode,
      side: analysis.action === 'LONG' ? 'BUY' : 'SELL',
      orderType: 'MARKET',
      status: 'simulated',
      leverage: analysis.leverage,
      quantity,
      price: analysis.price,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      pnlSnapshot: 0,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return `Opened paper ${analysis.action.toLowerCase()} on ${analysis.symbol} at ${analysis.price.toFixed(2)}.`;
  }

  private async openLivePosition(
    signalId: string,
    analysis: TradingAnalysis,
    config: TradingConfig,
    pairMeta?: Record<string, string | number>,
  ): Promise<string> {
    if (!config.allowLiveExecution || config.mode !== 'live') {
      return `Blocked live execution for ${analysis.symbol}: live mode is not armed.`;
    }
    if (!config.apiKey || !config.apiSecret) {
      return `Blocked live execution for ${analysis.symbol}: Bitunix credentials missing.`;
    }
    if (analysis.action === 'HOLD' || analysis.stopLoss == null || analysis.takeProfit == null) {
      return `Held ${analysis.symbol}: no high-conviction entry.`;
    }
    const openPositions = this.getOpenPositionsForMode(config.mode);
    if (openPositions.length >= config.maxConcurrentPositions) {
      return `Skipped ${analysis.symbol}: waiting for the current live position to close.`;
    }
    const quantity = this.computeOrderQuantity(analysis, config, pairMeta);
    if (quantity <= 0) {
      createOrder({
        positionId: null,
        signalId,
        provider: 'bitunix',
        providerOrderId: null,
        symbol: analysis.symbol,
        mode: config.mode,
        side: analysis.action === 'LONG' ? 'BUY' : 'SELL',
        orderType: 'MARKET',
        status: 'rejected',
        leverage: analysis.leverage,
        quantity: 0,
        price: analysis.price,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        pnlSnapshot: null,
        errorMessage: 'Account size is below Bitunix minimum trade size.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return `Skipped ${analysis.symbol}: account size is below Bitunix minimum trade size.`;
    }

    const client = this.getClient(config);
    let response: Record<string, unknown>;
    try {
      await client.changeLeverage({
        symbol: analysis.symbol,
        leverage: analysis.leverage,
        marginCoin: config.marginCoin,
      });
      response = await client.placeMarketOrder({
        symbol: analysis.symbol,
        side: analysis.action === 'LONG' ? 'BUY' : 'SELL',
        quantity,
        leverage: analysis.leverage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      createOrder({
        positionId: null,
        signalId,
        provider: 'bitunix',
        providerOrderId: null,
        symbol: analysis.symbol,
        mode: config.mode,
        side: analysis.action === 'LONG' ? 'BUY' : 'SELL',
        orderType: 'MARKET',
        status: 'rejected',
        leverage: analysis.leverage,
        quantity,
        price: analysis.price,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        pnlSnapshot: null,
        errorMessage: message,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return `Rejected ${analysis.symbol}: ${message}`;
    }
    createOrder({
      positionId: null,
      signalId,
      provider: 'bitunix',
      providerOrderId: `${response.orderId ?? response.clientId ?? ''}` || null,
      symbol: analysis.symbol,
      mode: config.mode,
      side: analysis.action === 'LONG' ? 'BUY' : 'SELL',
      orderType: 'MARKET',
      status: 'submitted',
      leverage: analysis.leverage,
      quantity,
      price: analysis.price,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      pnlSnapshot: null,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const providerPositionId = `${response.positionId ?? ''}` || await this.resolveLivePositionId(client, analysis.symbol, analysis.action);
    const livePosition = this.upsertLivePositionFromEntry(analysis, quantity, providerPositionId || null);
    if (providerPositionId && (analysis.takeProfit != null || analysis.stopLoss != null)) {
      await this.attachLiveProtection(client, livePosition, analysis.takeProfit, analysis.stopLoss).catch((err) => {
        console.error('[Trading] Failed to attach TP/SL order:', err);
        livePosition.meta = {
          ...livePosition.meta,
          tpSlAttached: false,
          tpSlAttachError: err instanceof Error ? err.message : `${err}`,
          tpSlAttachErrorAt: Date.now(),
        };
        updatePosition(livePosition);
        createOrder({
          positionId: null,
          signalId,
          provider: 'bitunix',
          providerOrderId: null,
          symbol: analysis.symbol,
          mode: config.mode,
          side: analysis.action === 'LONG' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          status: 'rejected',
          leverage: analysis.leverage,
          quantity,
          price: analysis.price,
          stopLoss: analysis.stopLoss,
          takeProfit: analysis.takeProfit,
          pnlSnapshot: null,
          errorMessage: `Protective exit attach failed: ${err instanceof Error ? err.message : `${err}`}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
    }
    return `Submitted live ${analysis.action.toLowerCase()} on ${analysis.symbol}.`;
  }

  async syncLiveState(): Promise<void> {
    const config = getTradingConfig();
    if (config.mode !== 'live' || !config.apiKey || !config.apiSecret) return;
    const client = this.getClient(config);
    const [positions, orders] = await Promise.all([
      client.getPendingPositions(),
      client.getPendingOrders(undefined, 100),
    ]);
    const tickerMap = new Map<string, Record<string, string | number>>();
    const positionSymbols = positions.map((remote) => `${remote.symbol ?? ''}`).filter(Boolean);
    if (positionSymbols.length > 0) {
      const tickers = await client.getTickers(positionSymbols).catch(() => []);
      for (const ticker of tickers) {
        tickerMap.set(`${ticker.symbol ?? ''}`, ticker);
      }
    }

    const remoteSymbols = new Set<string>();
    for (const remote of positions) {
      const symbol = `${remote.symbol ?? ''}`;
      if (!symbol) continue;
      remoteSymbols.add(symbol);
      const existing = getOpenPositionBySymbol(symbol, 'live');
      const ticker = tickerMap.get(symbol);
      const currentPrice = Number(
        ticker?.markPrice ??
        ticker?.lastPrice ??
        remote.markPrice ??
        remote.lastPrice ??
        remote.mark_price ??
        0,
      );
      const entryPrice = Number(remote.avgOpenPrice ?? remote.entryPrice ?? remote.entry_price ?? 0);
      const quantity = Number(remote.qty ?? remote.volume ?? 0);
      const unrealizedPnl = Number(remote.unrealizedPNL ?? remote.unrealizedPnl ?? 0);
      const side = this.toLocalPositionSide(remote.side);
      const leverage = Number(remote.leverage ?? 1);
      const notional = Number(remote.entryValue ?? remote.positionValue ?? entryPrice * quantity);
      if (existing) {
        const latestOrder = this.findLatestOrderForSymbol(symbol, 'live');
        const metaStopLoss = existing.meta.stopLoss == null ? null : Number(existing.meta.stopLoss);
        const metaTakeProfit = existing.meta.takeProfit == null ? null : Number(existing.meta.takeProfit);
        const orderStopLoss = latestOrder?.stopLoss ?? null;
        const orderTakeProfit = latestOrder?.takeProfit ?? null;
        const protection = this.normalizeProtectionLevels(
          side,
          currentPrice || existing.currentPrice || entryPrice,
          existing.takeProfit ?? metaTakeProfit ?? orderTakeProfit,
          existing.stopLoss ?? metaStopLoss ?? orderStopLoss,
        );
        existing.side = side;
        existing.leverage = leverage;
        existing.quantity = quantity;
        existing.currentPrice = currentPrice || existing.currentPrice;
        existing.unrealizedPnl = unrealizedPnl;
        existing.notional = notional;
        existing.stopLoss = protection.stopLoss;
        existing.takeProfit = protection.takeProfit;
        existing.meta = {
          ...existing.meta,
          providerPositionId: `${remote.positionId ?? ''}`,
          remoteSide: `${remote.side ?? ''}`,
          stopLoss: existing.stopLoss,
          takeProfit: existing.takeProfit,
        };
        updatePosition(existing);
        if ((existing.stopLoss != null || existing.takeProfit != null) && !existing.meta.tpSlAttached) {
          await this.attachLiveProtection(client, existing, existing.takeProfit, existing.stopLoss).catch((err) => {
            existing.meta = {
              ...existing.meta,
              tpSlAttached: false,
              tpSlAttachError: err instanceof Error ? err.message : `${err}`,
              tpSlAttachErrorAt: Date.now(),
            };
            updatePosition(existing);
          });
        }
      } else if (quantity > 0 && entryPrice > 0) {
        const protection = this.normalizeProtectionLevels(side, currentPrice || entryPrice, null, null);
        createPosition({
          symbol,
          mode: 'live',
          side,
          status: 'open',
          leverage,
          quantity,
          entryPrice,
          currentPrice: currentPrice || entryPrice,
          stopLoss: protection.stopLoss,
          takeProfit: protection.takeProfit,
          notional,
          unrealizedPnl,
          realizedPnl: 0,
          openedAt: Date.now(),
          closedAt: null,
          closePrice: null,
          meta: {
            providerPositionId: `${remote.positionId ?? ''}`,
            stopLoss: protection.stopLoss,
            takeProfit: protection.takeProfit,
          },
        });
      }
    }

    for (const existing of this.getOpenPositionsForMode('live')) {
      if (remoteSymbols.has(existing.symbol)) continue;
      existing.status = 'closed';
      existing.closedAt = Date.now();
      existing.closePrice = existing.currentPrice;
      existing.realizedPnl = existing.unrealizedPnl;
      updatePosition(existing);
      createOrder({
        positionId: existing.id,
        signalId: null,
        provider: 'bitunix',
        providerOrderId: null,
        symbol: existing.symbol,
        mode: 'live',
        side: existing.side === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        status: 'closed',
        leverage: existing.leverage,
        quantity: existing.quantity,
        price: existing.currentPrice,
        stopLoss: existing.stopLoss,
        takeProfit: existing.takeProfit,
        pnlSnapshot: existing.realizedPnl,
        errorMessage: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const existingOrders = listOrders(500);
    for (const remote of orders.orderList ?? []) {
      const providerOrderId = `${remote.orderId ?? ''}`;
      if (!providerOrderId || existingOrders.some((order) => order.providerOrderId === providerOrderId)) continue;
      createOrder({
        positionId: null,
        signalId: null,
        provider: 'bitunix',
        providerOrderId,
        symbol: `${remote.symbol ?? ''}`,
        mode: 'live',
        side: `${remote.side}` === 'SELL' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        status: 'submitted',
        leverage: Number(remote.leverage ?? 1),
        quantity: Number(remote.qty ?? remote.volume ?? 0),
        price: Number(remote.price ?? remote.avgPrice ?? 0),
        stopLoss: null,
        takeProfit: null,
        pnlSnapshot: null,
        errorMessage: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  async runCycle(trigger: 'manual' | 'scheduler' = 'manual'): Promise<{ runId: string; messages: string[] }> {
    const config = getTradingConfig();
    const startedAt = Date.now();
    if (!config.enabled && trigger === 'scheduler') {
      const run = createTradingRun({
        mode: config.mode,
        trigger,
        status: 'blocked',
        summary: 'Trading is disabled.',
        createdAt: startedAt,
      });
      return { runId: run.id, messages: ['Trading is disabled.'] };
    }

    if (config.mode === 'live' && config.apiKey && config.apiSecret) {
      await this.syncLiveState();
    }

    const pairMap = await this.getTradingPairMap(config);
    const symbols = await this.discoverSymbols(config);
    const analyses: TradingAnalysis[] = [];
    for (const symbol of symbols) {
      try {
        analyses.push(await this.analyzeSymbol(symbol));
      } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        if (message.toLowerCase().includes('too frequently')) {
          await sleep(1000);
          continue;
        }
        console.error(`[Trading] Analysis failed for ${symbol}:`, error);
      }
      await sleep(250);
    }
    this.updateOpenPositionMarks(new Map(analyses.map((analysis) => [analysis.symbol, analysis.price])));
    if (config.mode === 'live') {
      await this.enforceLiveRiskControls(new Map(analyses.map((analysis) => [analysis.symbol, analysis.price])));
    }
    const openPositions = this.getOpenPositionsForMode(config.mode);
    const availableSlots = Math.max(0, config.maxConcurrentPositions - openPositions.length);
    const rankedAnalyses = analyses
      .slice()
      .filter((analysis) => this.computeOrderQuantity(analysis, config, pairMap.get(analysis.symbol)) > 0)
      .sort((a, b) => b.confidence - a.confidence);
    let selectedAnalyses = rankedAnalyses
      .filter((analysis) => analysis.action !== 'HOLD')
      .slice(0, Math.min(config.setupsPerRun, availableSlots));
    if (availableSlots > 0 && selectedAnalyses.length === 0 && rankedAnalyses.length > 0 && rankedAnalyses[0]!.confidence >= 0.12) {
      const best = rankedAnalyses[0]!;
      selectedAnalyses = [{
        ...best,
        action: best.action === 'HOLD' ? (best.indicators.fastEma >= best.indicators.slowEma ? 'LONG' : 'SHORT') : best.action,
        rationale: `${best.rationale} Fallback execution enabled the top-ranked setup because no stronger non-HOLD setup was found.`,
      }];
    }
    const run = createTradingRun({
      mode: config.mode,
      trigger,
      status: 'completed',
      summary: availableSlots === 0
        ? `Scanned ${analyses.length} markets and held because the concurrent position cap is full.`
        : `Scanned ${analyses.length} markets and selected ${selectedAnalyses.length} setup(s).`,
      createdAt: startedAt,
    });

    const messages: string[] = [];
    for (const analysis of analyses) {
      const signal = createSignal(run.id, analysis);
      if (!selectedAnalyses.find((candidate) => candidate.symbol === analysis.symbol && candidate.action === analysis.action)) {
        continue;
      }
      if (config.mode === 'paper') {
        messages.push(this.openPaperPosition(signal.id, analysis, config, pairMap.get(analysis.symbol)));
      } else {
        messages.push(await this.openLivePosition(signal.id, analysis, config, pairMap.get(analysis.symbol)));
      }
    }
    if (availableSlots === 0) {
      messages.push('Concurrent position cap is full, so JARVIS is holding until a slot opens.');
    } else if (messages.length === 0) {
      messages.push(`Scanned ${analyses.length} USDT markets and found no executable setup.`);
    }
    return { runId: run.id, messages };
  }

  async getSummary(): Promise<TradingSummary> {
    const config = getTradingConfig();
    let liveAccount = { equity: 0, available: 0, unrealized: 0 };
    if (config.mode === 'live' && config.apiKey && config.apiSecret) {
      try {
        await this.syncLiveState();
        liveAccount = await this.getLiveAccountSnapshot(config);
      } catch (err) {
        console.error('[Trading] Live sync failed:', err);
      }
    }
    const recentSignals = listSignals(12);
    this.updateOpenPositionMarks(new Map(recentSignals.map((signal) => [signal.symbol, signal.price])));
    const positions = listPositions(undefined, 500);
    const openPositions = positions.filter((position) => position.status === 'open');
    const recentOrders = listOrders(20);
    const dayStart = Date.now() - 24 * 60 * 60 * 1000;
    const closed = positions.filter((position) => position.status === 'closed');
    const realizedPnl = closed.reduce((sum, position) => sum + position.realizedPnl, 0);
    const unrealizedPnl = openPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
    const dayPnl = positions
      .filter((position) => position.openedAt >= dayStart || (position.closedAt ?? 0) >= dayStart)
      .reduce((sum, position) => sum + position.realizedPnl + (position.status === 'open' ? position.unrealizedPnl : 0), 0);
    const winningClosed = closed.filter((position) => position.realizedPnl > 0).length;
    const winRate = closed.length > 0 ? winningClosed / closed.length : 0;
    const safeConfig = {
      ...config,
      apiKey: '',
      apiSecret: '',
    };
    const overrides = getTradingSummaryOverrides();
    return {
      config: safeConfig,
      accountEquity: overrides?.accountEquity ?? (config.mode === 'live' ? liveAccount.equity : this.getAccountEquity(config)),
      accountAvailable: overrides?.accountAvailable ?? (config.mode === 'live' ? liveAccount.available : this.getAccountEquity(config)),
      dayPnl: overrides?.dayPnl ?? dayPnl,
      realizedPnl: overrides?.realizedPnl ?? realizedPnl,
      unrealizedPnl: overrides?.unrealizedPnl ?? (config.mode === 'live' ? liveAccount.unrealized : unrealizedPnl),
      winRate: overrides?.winRate ?? winRate,
      openPositions,
      recentOrders,
      recentSignals,
      recentRuns: listTradingRuns(12),
    };
  }

  getPnlCsv(): string {
    const rows = getPnlRows(1000);
    const header = [
      'symbol', 'mode', 'side', 'status', 'entry_price', 'close_price', 'current_price',
      'quantity', 'leverage', 'notional', 'realized_pnl', 'unrealized_pnl', 'opened_at', 'closed_at',
    ];
    const body = rows.map((row) => ([
      row.symbol,
      row.mode,
      row.side,
      row.status,
      row.entryPrice,
      row.closePrice ?? '',
      row.currentPrice,
      row.quantity,
      row.leverage,
      row.notional,
      row.realizedPnl,
      row.unrealizedPnl,
      new Date(row.openedAt).toISOString(),
      row.closedAt ? new Date(row.closedAt).toISOString() : '',
    ].join(',')));
    return [header.join(','), ...body].join('\n');
  }
}

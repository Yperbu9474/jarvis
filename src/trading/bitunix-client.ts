import { createHash } from 'node:crypto';
import type { Candle } from './types.ts';

const BASE_URL = 'https://fapi.bitunix.com';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, `${value}`);
  }
  query.sort();
  return query.toString();
}

function formatExchangeNumber(value: number): string {
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, '');
}

export class BitunixClient {
  constructor(private readonly apiKey: string, private readonly apiSecret: string) {}

  private sign(timestamp: number, nonce: string, query = '', body = ''): string {
    const seed = sha256(`${nonce}${timestamp}${this.apiKey}${query}${body}`);
    return sha256(`${seed}${this.apiSecret}`);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, string | number | undefined>,
    body?: Record<string, unknown>,
    auth = false,
  ): Promise<T> {
    const query = params ? buildQuery(params) : '';
    const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      language: 'en-US',
    };
    if (auth) {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('Bitunix credentials are not configured.');
      }
      const timestamp = Date.now();
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const bodyString = body ? JSON.stringify(body) : '';
      headers['api-key'] = this.apiKey;
      headers.timestamp = `${timestamp}`;
      headers.nonce = nonce;
      headers.sign = this.sign(timestamp, nonce, query.replace(/[=&]/g, ''), bodyString);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json() as { code?: number; data?: T; msg?: string };
    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || `Bitunix request failed with HTTP ${response.status}`);
    }
    return payload.data as T;
  }

  async getKlines(symbol: string, interval = '15m', limit = 120): Promise<Candle[]> {
    const rows = await this.request<Array<Record<string, string | number>>>(
      'GET',
      '/api/v1/futures/market/kline',
      { symbol, interval, limit, type: 'MARK_PRICE' },
    );
    return rows.map((row) => ({
      time: Number(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      quoteVol: row.quoteVol == null ? undefined : Number(row.quoteVol),
      baseVol: row.baseVol == null ? undefined : Number(row.baseVol),
    }));
  }

  async getTradingPairs(): Promise<Array<Record<string, string | number>>> {
    return this.request<Array<Record<string, string | number>>>(
      'GET',
      '/api/v1/futures/market/trading_pairs',
    );
  }

  async getTickers(symbols?: string[]): Promise<Array<Record<string, string | number>>> {
    return this.request<Array<Record<string, string | number>>>(
      'GET',
      '/api/v1/futures/market/tickers',
      symbols && symbols.length > 0 ? { symbols: symbols.join(',') } : undefined,
    );
  }

  async changeLeverage(input: { symbol: string; leverage: number; marginCoin: string }): Promise<Record<string, unknown>[]> {
    return this.request<Record<string, unknown>[]>(
      'POST',
      '/api/v1/futures/account/change_leverage',
      undefined,
      {
        symbol: input.symbol,
        leverage: input.leverage,
        marginCoin: input.marginCoin,
      },
      true,
    );
  }

  async getAccount(marginCoin = 'USDT'): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      '/api/v1/futures/account',
      { marginCoin },
      undefined,
      true,
    );
  }

  async getPendingPositions(symbol?: string): Promise<Array<Record<string, unknown>>> {
    return this.request<Array<Record<string, unknown>>>(
      'GET',
      '/api/v1/futures/position/get_pending_positions',
      symbol ? { symbol } : undefined,
      undefined,
      true,
    );
  }

  async getPendingOrders(symbol?: string, limit = 100): Promise<{ total: string; orderList: Array<Record<string, unknown>> }> {
    return this.request<{ total: string; orderList: Array<Record<string, unknown>> }>(
      'GET',
      '/api/v1/futures/trade/get_pending_orders',
      { symbol, limit },
      undefined,
      true,
    );
  }

  async placePositionTpSlOrder(input: {
    symbol: string;
    positionId: string;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/api/v1/futures/tpsl/position/place_order',
      undefined,
      {
        symbol: input.symbol,
        positionId: input.positionId,
        tpPrice: input.takeProfit ? formatExchangeNumber(input.takeProfit) : undefined,
        tpStopType: input.takeProfit ? 'LAST_PRICE' : undefined,
        slPrice: input.stopLoss ? formatExchangeNumber(input.stopLoss) : undefined,
        slStopType: input.stopLoss ? 'LAST_PRICE' : undefined,
      },
      true,
    );
  }

  async placeMarketOrder(input: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    leverage: number;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/api/v1/futures/trade/place_order',
      undefined,
      {
        symbol: input.symbol,
        side: input.side,
        qty: formatExchangeNumber(input.quantity),
        tradeSide: 'OPEN',
        orderType: 'MARKET',
        leverage: input.leverage,
        tpPrice: input.takeProfit ? formatExchangeNumber(input.takeProfit) : undefined,
        tpStopType: input.takeProfit ? 'LAST_PRICE' : undefined,
        tpOrderType: input.takeProfit ? 'MARKET' : undefined,
        slPrice: input.stopLoss ? formatExchangeNumber(input.stopLoss) : undefined,
        slStopType: input.stopLoss ? 'LAST_PRICE' : undefined,
        slOrderType: input.stopLoss ? 'MARKET' : undefined,
      },
      true,
    );
  }

  async placeCloseOrder(input: {
    positionId?: string | null;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
  }): Promise<Record<string, unknown>> {
    if (input.positionId) {
      return this.request<Record<string, unknown>>(
        'POST',
        '/api/v1/futures/trade/flash_close_position',
        undefined,
        {
          positionId: input.positionId,
        },
        true,
      );
    }
    return this.request<Record<string, unknown>>(
      'POST',
      '/api/v1/futures/trade/place_order',
      undefined,
      {
        symbol: input.symbol,
        side: input.side,
        qty: formatExchangeNumber(input.quantity),
        tradeSide: 'CLOSE',
        orderType: 'MARKET',
        reduceOnly: true,
      },
      true,
    );
  }
}

/**
 * REST client for the CTG.EXCHANGE API.
 *
 * Covers the whole `/api/v1` REST surface: public market data plus the
 * private, API-key-signed account and order endpoints.
 *
 *     const client = new Client({ apiKey, apiSecret });
 *     const book = await client.getOrderBook("CTGUSDT");
 */

import { CtgExchangeError, RateLimitError, errorFromResponse } from "./errors.js";
import { randomUUID } from "node:crypto";
import { restHeaders } from "./signing.js";
import type {
  Balance,
  Candle,
  ModifyOrderParams,
  Order,
  OrderBook,
  OrderStatus,
  PlaceOrderParams,
  PlaceOrderResult,
  SymbolInfo,
  Ticker,
  Trade,
  UserFees,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.ctg.exchange";

/** A `fetch`-compatible function — injectable for testing. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Key id (`ak_...`). Required only for private endpoints. */
  apiKey?: string;
  /** Key secret (`sk_...`). Required only for private endpoints. */
  apiSecret?: string;
  /** REST base URL. Defaults to production. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** How many times to retry a `429`, honouring `Retry-After`. Default 0. */
  maxRetries?: number;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  auth?: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function numToStr(value: string | number): string {
  return typeof value === "number" ? String(value) : value;
}

/** A REST client for the CTG.EXCHANGE API. */
export class Client {
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 0;
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike);
    if (!fetchImpl) {
      throw new CtgExchangeError(
        "no fetch implementation available; pass `fetch` in ClientOptions",
      );
    }
    this.fetchImpl = fetchImpl;
  }

  private buildRequestUri(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    if (!query) return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { query, body, auth = false } = options;
    // request-uri must be the path+query exactly as sent, and the body
    // hash must cover the exact bytes on the wire.
    const requestUri = this.buildRequestUri(path, query);
    const bodyStr = body === undefined ? "" : JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {};
      if (bodyStr) headers["Content-Type"] = "application/json";
      if (auth) {
        if (!this.apiKey || !this.apiSecret) {
          throw new CtgExchangeError(
            "apiKey and apiSecret are required for private endpoints",
          );
        }
        Object.assign(
          headers,
          restHeaders(this.apiKey, this.apiSecret, method, requestUri, bodyStr),
        );
      }

      const response = await this.fetchImpl(this.baseUrl + requestUri, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) {
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const retryAfter = parseRetryAfter(response);
      const error = errorFromResponse(
        response.status,
        await safeJson(response),
        retryAfter,
      );
      if (error instanceof RateLimitError && attempt < this.maxRetries) {
        await sleep((retryAfter ?? 1) * 1000);
        continue;
      }
      throw error;
    }
  }

  // -- public market data ---------------------------------------------

  /** All trading symbols with their order filters. */
  getSymbols(): Promise<SymbolInfo[]> {
    return this.request("GET", "/api/v1/symbols");
  }

  /** 24h ticker for every symbol. */
  getTickers(): Promise<Ticker[]> {
    return this.request("GET", "/api/v1/tickers");
  }

  /** Current order book for `symbol`. */
  getOrderBook(symbol: string): Promise<OrderBook> {
    return this.request("GET", `/api/v1/${symbol}/orderbook`);
  }

  /** 24h ticker for `symbol`. */
  getTicker(symbol: string): Promise<Ticker> {
    return this.request("GET", `/api/v1/${symbol}/ticker`);
  }

  /**
   * Candles for `symbol` at `interval` (`1m` / `5m` / `15m` / `1h` /
   * `4h` / `1d`).
   *
   * Omit `from` / `to` for the latest `limit` candles. Pass `from` /
   * `to` (Unix ms) to select a historical window `[from, to)` for
   * scrollback.
   */
  getCandles(
    symbol: string,
    interval = "1m",
    opts: { limit?: number; from?: number; to?: number } = {},
  ): Promise<Candle[]> {
    return this.request("GET", `/api/v1/${symbol}/candles`, {
      query: {
        interval,
        limit: opts.limit,
        from: opts.from,
        to: opts.to,
      },
    });
  }

  /** Recent public trade prints for `symbol`. */
  getTrades(symbol: string, limit?: number): Promise<Trade[]> {
    return this.request("GET", `/api/v1/${symbol}/trades`, {
      query: { limit },
    });
  }

  // -- private: account -----------------------------------------------

  /** Per-asset balances for the API key's owner (scope: read). */
  getBalances(): Promise<Balance[]> {
    return this.request("GET", "/api/v1/me/balances", { auth: true });
  }

  /** Fee/rebate snapshot for the API key's owner (scope: read). */
  getFees(): Promise<UserFees> {
    return this.request("GET", "/api/v1/me/fees", { auth: true });
  }

  // -- private: orders ------------------------------------------------

  /**
   * Place an order (scope: trade).
   *
   * A `clientOrderId` is generated when you do not supply one — it lets
   * the engine de-dup on safe retries.
   */
  placeOrder(
    symbol: string,
    params: PlaceOrderParams,
  ): Promise<PlaceOrderResult> {
    const body: Record<string, string> = {
      client_order_id: params.clientOrderId ?? randomUUID(),
      side: params.side,
      type: params.type,
    };
    if (params.price !== undefined) body.price = numToStr(params.price);
    if (params.qty !== undefined) body.qty = numToStr(params.qty);
    return this.request("POST", `/api/v1/me/orders/${symbol}`, {
      body,
      auth: true,
    });
  }

  /** List the owner's orders for `symbol` (scope: read). */
  getOrders(
    symbol: string,
    opts: { status?: OrderStatus; limit?: number; offset?: number } = {},
  ): Promise<Order[]> {
    return this.request("GET", `/api/v1/me/orders/${symbol}`, {
      query: { status: opts.status, limit: opts.limit, offset: opts.offset },
      auth: true,
    });
  }

  /**
   * List every open order across all symbols (scope: read).
   *
   * Each `Order` carries its own `symbol`; decimal fields are converted
   * per that order's scales. For closed-order history use `getOrders`
   * per symbol.
   */
  getOpenOrders(): Promise<Order[]> {
    return this.request("GET", "/api/v1/me/orders/open", { auth: true });
  }

  /** Get one order by its canonical server id (scope: read). */
  getOrder(symbol: string, orderId: string): Promise<Order> {
    return this.request("GET", `/api/v1/me/orders/${symbol}/${orderId}`, {
      auth: true,
    });
  }

  /** Cancel one order (scope: trade). */
  cancelOrder(symbol: string, orderId: string): Promise<Order> {
    return this.request("DELETE", `/api/v1/me/orders/${symbol}/${orderId}`, {
      auth: true,
    });
  }

  /** Cancel every open order for `symbol` (scope: trade). */
  async cancelAllOrders(symbol: string): Promise<Order[]> {
    const data = await this.request<{ orders?: Order[] }>(
      "DELETE",
      `/api/v1/me/orders/${symbol}`,
      { auth: true },
    );
    return data?.orders ?? [];
  }

  /**
   * Modify a resting order's price and quantity (scope: trade).
   *
   * The API expects the full new state — pass both `newPrice` and
   * `newQty`.
   */
  async modifyOrder(
    symbol: string,
    orderId: string,
    params: ModifyOrderParams,
  ): Promise<Order> {
    const body: Record<string, string> = {};
    if (params.newPrice !== undefined) {
      body.new_price = numToStr(params.newPrice);
    }
    if (params.newQty !== undefined) body.new_qty = numToStr(params.newQty);
    const data = await this.request<Order & { order?: Order }>(
      "PATCH",
      `/api/v1/me/orders/${symbol}/${orderId}`,
      { body, auth: true },
    );
    // The API wraps the modified order: { order: {...}, trades: [...] }.
    return data.order ?? data;
  }

  // -- private: trades ------------------------------------------------

  /** The owner's trade history for `symbol` (scope: read). */
  getMyTrades(
    symbol: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Trade[]> {
    return this.request("GET", `/api/v1/me/trades/${symbol}`, {
      query: { limit: opts.limit, offset: opts.offset },
      auth: true,
    });
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

async function safeJson(
  response: Response,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body = (await response.json()) as unknown;
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

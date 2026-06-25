/**
 * WebSocket clients for the CTG.EXCHANGE streams.
 *
 * - {@link MarketDataStream} — public market data, no auth.
 * - {@link UserStream} — the caller's private `orders` / `trades` /
 *   `balances`, authenticated in-band with a signed first frame.
 *
 * Both auto-reconnect by default and re-send their subscriptions on
 * every (re)connect, so a dropped socket is transparent to the
 * consumer:
 *
 *     const stream = new MarketDataStream({ channels: ["trades@CTGUSDT"] });
 *     for await (const msg of stream) {
 *       console.log(msg.channel, msg.type, msg.data);
 *     }
 */

import { type RawData, WebSocket } from "ws";
import { CtgExchangeError, AuthenticationError } from "./errors.js";
import type { StreamMessage } from "./types.js";
import { wsAuthMessage } from "./signing.js";

export const DEFAULT_WS_BASE_URL = "wss://api.ctg.exchange";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse a raw frame into a {@link StreamMessage}, or `null` for control
 * frames (auth replies, subscribe acks) — only data frames are surfaced.
 */
export function parseFrame(raw: string): StreamMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const obj = payload as Record<string, unknown>;
  if (obj.type !== "snapshot" && obj.type !== "update") return null;
  return {
    type: obj.type,
    channel: typeof obj.channel === "string" ? obj.channel : "",
    symbol: typeof obj.symbol === "string" ? obj.symbol : undefined,
    data: obj.data,
    raw: obj,
  };
}

export interface StreamOptions {
  /** WebSocket base URL. Defaults to production. */
  baseUrl?: string;
  /** Channels to subscribe to on every (re)connect. */
  channels?: Iterable<string>;
  /** Auto-reconnect on a dropped socket. Default `true`. */
  reconnect?: boolean;
  /** Delay before a reconnect attempt, in milliseconds. Default 2000. */
  reconnectDelayMs?: number;
}

/** Shared connect / subscribe / reconnect machinery. */
abstract class BaseStream implements AsyncIterable<StreamMessage> {
  private readonly url: string;
  private readonly channels: Set<string>;
  private reconnect: boolean;
  private readonly reconnectDelayMs: number;
  private ws: WebSocket | null = null;
  private closed = false;

  private queue: StreamMessage[] = [];
  private socketEnded = false;
  private resolveNext: (() => void) | null = null;

  protected constructor(path: string, options: StreamOptions) {
    this.url = (options.baseUrl ?? DEFAULT_WS_BASE_URL).replace(/\/+$/, "") +
      path;
    this.channels = new Set(options.channels ?? []);
    this.reconnect = options.reconnect ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
  }

  /** No-op for the public stream; overridden by {@link UserStream}. */
  protected async authenticate(_ws: WebSocket): Promise<void> {}

  /** Close the socket and stop reconnecting. */
  close(): void {
    this.closed = true;
    this.reconnect = false;
    this.socketEnded = true;
    this.ws?.close();
    this.ws = null;
    this.wake();
  }

  /** Add channels (e.g. `orderbook@CTGUSDT`). Kept across reconnects. */
  subscribe(channels: string | Iterable<string>): void {
    const list = typeof channels === "string" ? [channels] : [...channels];
    for (const c of list) this.channels.add(c);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ method: "subscribe", channels: list });
    }
  }

  /** Drop channels. */
  unsubscribe(channels: string | Iterable<string>): void {
    const list = typeof channels === "string" ? [channels] : [...channels];
    for (const c of list) this.channels.delete(c);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ method: "unsubscribe", channels: list });
    }
  }

  private send(obj: unknown): void {
    this.ws?.send(JSON.stringify(obj));
  }

  private wake(): void {
    const resolve = this.resolveNext;
    if (resolve) {
      this.resolveNext = null;
      resolve();
    }
  }

  private async open(): Promise<void> {
    this.queue = [];
    this.socketEnded = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
    });

    await this.authenticate(ws);

    ws.on("message", (data: RawData) => {
      const message = parseFrame(data.toString());
      if (message) {
        this.queue.push(message);
        this.wake();
      }
    });
    const end = (): void => {
      this.socketEnded = true;
      this.wake();
    };
    ws.on("close", end);
    ws.on("error", end);

    if (this.channels.size > 0) {
      this.send({ method: "subscribe", channels: [...this.channels] });
    }
  }

  private async nextMessage(): Promise<StreamMessage | null> {
    for (;;) {
      const message = this.queue.shift();
      if (message !== undefined) return message;
      if (this.socketEnded) return null;
      await new Promise<void>((resolve) => {
        this.resolveNext = resolve;
      });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamMessage> {
    while (!this.closed) {
      try {
        await this.open();
      } catch (err) {
        this.ws = null;
        if (!this.reconnect || this.closed) throw err;
        await sleep(this.reconnectDelayMs);
        continue;
      }
      for (;;) {
        const message = await this.nextMessage();
        if (message === null) break;
        yield message;
      }
      this.ws = null;
      if (!this.reconnect || this.closed) return;
      await sleep(this.reconnectDelayMs);
    }
  }
}

/**
 * Public market-data stream — `orderbook` / `ticker` / `candles` /
 * `trades`. No authentication.
 */
export class MarketDataStream extends BaseStream {
  constructor(options: StreamOptions = {}) {
    super("/api/v1/stream", options);
  }
}

export interface UserStreamOptions extends StreamOptions {
  /** Key id (`ak_...`). */
  apiKey: string;
  /** Key secret (`sk_...`). */
  apiSecret: string;
}

/**
 * Private stream — the caller's `orders` / `trades` / `balances`.
 * Authenticates in-band with a signed first frame.
 */
export class UserStream extends BaseStream {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(options: UserStreamOptions) {
    if (!options.apiKey || !options.apiSecret) {
      throw new CtgExchangeError(
        "apiKey and apiSecret are required for the private stream",
      );
    }
    super("/api/v1/me/stream", options);
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
  }

  protected override async authenticate(ws: WebSocket): Promise<void> {
    ws.send(JSON.stringify(wsAuthMessage(this.apiKey, this.apiSecret)));
    const reply = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        ws.once("message", (data: RawData) => {
          try {
            resolve(JSON.parse(data.toString()) as Record<string, unknown>);
          } catch (err) {
            reject(err as Error);
          }
        });
        ws.once("close", () =>
          reject(
            new AuthenticationError(
              401,
              undefined,
              "socket closed during auth",
            ),
          ),
        );
      },
    );
    if (reply.op !== "auth" || reply.success !== true) {
      ws.close();
      const detail =
        typeof reply.error === "string"
          ? reply.error
          : "WebSocket auth rejected";
      throw new AuthenticationError(401, undefined, detail);
    }
  }
}

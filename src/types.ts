/**
 * Types for CTG.EXCHANGE API payloads.
 *
 * The API's **decimal contract**: every monetary value — `price`, `qty`,
 * `volume`, fee amounts — is a JSON **string** (`"3500.55"`), never a
 * number. This SDK keeps those fields as `string`: that is lossless and
 * leaves the choice of big-decimal library to you. Never `Number()`
 * them blindly. Basis-point fields, counters, ids and epoch timestamps
 * are real `number`s; `created_at` is an RFC 3339 `string`.
 */

/** A trading pair plus its order filters. All money fields are strings. */
export interface SymbolInfo {
  symbol: string;
  base_asset: string;
  quote_asset: string;
  price_scale: number;
  qty_scale: number;
  quote_asset_scale: number;
  tick_size: string;
  step_size: string;
  min_price: string;
  max_price: string;
  min_qty: string;
  max_qty: string;
  min_notional: string;
}

/** A 24h rolling ticker. */
export interface Ticker {
  symbol: string;
  price: string;
  open: string;
  high: string;
  low: string;
  close: string;
  /** Base-asset volume. */
  volume: string;
  trades: number;
  change_bps: number;
  /** Epoch timestamp. */
  ts: number;
}

/** A single OHLC candle. */
export interface Candle {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  open_time: number;
  close_time: number;
  trades: number;
}

/** One price level of an order book. */
export interface BookLevel {
  price: string;
  qty: string;
}

/** A full order book snapshot. */
export interface OrderBook {
  symbol: string;
  last_update_id: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

/** A per-asset balance. */
export interface Balance {
  asset: string;
  available: string;
  reserved: string;
}

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus =
  | "new"
  | "open"
  | "partially_filled"
  | "filled"
  | "canceled"
  | "expired"
  | "rejected";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";

/** Fraction of a charged fee credited to a referrer. */
export interface FeeRebate {
  /** Referrer wallet address. */
  account_id?: string;
  /** Share of the fee in basis points. */
  fraction_bps?: number;
}

/** An order. */
export interface Order {
  /** Canonical server id (UUIDv7). */
  id: string;
  /** Client-supplied idempotency key. */
  client_order_id?: string;
  /** Owner wallet address. */
  uid?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  time_in_force?: TimeInForce;
  status: OrderStatus;
  price: string;
  avg_execution_price?: string;
  qty: string;
  filled_qty: string;
  remaining_qty: string;
  /** Total fee paid, a decimal string in the scale of `fee_asset`. */
  fee_amount?: string;
  fee_asset?: string;
  /** Per-order taker fee override in bps; 0 = global default. */
  taker_fee_bps?: number;
  /** Per-order maker fee override in bps; 0 = global default. */
  maker_fee_bps?: number;
  rebate?: FeeRebate;
  created_at: string;
  updated_at?: string;
}

/**
 * A matched trade. Both sides' addresses, order ids and fees are
 * exposed — see "matcher transparency".
 */
export interface Trade {
  id: string;
  symbol: string;
  price: string;
  qty: string;
  /** Side of the taker (aggressor) order. */
  aggressor_side?: OrderSide;
  maker_order_id?: string;
  taker_order_id?: string;
  buy_order_id?: string;
  sell_order_id?: string;
  /** Buyer wallet address. */
  buy_uid?: string;
  /** Seller wallet address. */
  sell_uid?: string;
  /** Effective buyer fee in bps; omitted when 0. */
  buy_fee_bps?: number;
  /** Effective seller fee in bps; omitted when 0. */
  sell_fee_bps?: number;
  buy_rebate?: FeeRebate;
  sell_rebate?: FeeRebate;
  buy_fee_amount?: string;
  buy_fee_asset?: string;
  sell_fee_amount?: string;
  sell_fee_asset?: string;
  created_at?: string;
}

/** A referral rebate entry. */
export interface Rebate {
  referrer_account: string;
  fraction_bps: number;
}

/**
 * A fee / rebate snapshot. A `null` integer means no override applies —
 * the platform default is then in effect.
 */
export interface UserFees {
  taker_fee_bps: number | null;
  maker_fee_bps: number | null;
  rebate: Rebate | null;
}

/** The result of placing an order: the order plus any immediate fills. */
export interface PlaceOrderResult {
  order: Order;
  trades: Trade[];
}

/** Parameters for placing an order. */
export interface PlaceOrderParams {
  side: OrderSide;
  type: OrderType;
  /** Decimal string (recommended) or number. */
  price?: string | number;
  /** Decimal string (recommended) or number. */
  qty?: string | number;
  /** Optional idempotency key; one is generated when omitted. */
  clientOrderId?: string;
}

/** Parameters for modifying an order — send both for the API to accept. */
export interface ModifyOrderParams {
  newPrice?: string | number;
  newQty?: string | number;
}

/** A parsed server WebSocket message: a `snapshot` or an `update`. */
export interface StreamMessage {
  type: "snapshot" | "update";
  channel: string;
  symbol?: string;
  data: unknown;
  /** The full raw frame. */
  raw: Record<string, unknown>;
}

/**
 * TypeScript SDK for the CTG.EXCHANGE exchange API.
 *
 * CTG.EXCHANGE is a hybrid crypto exchange (off-chain matcher, on-chain
 * custody on BNB Smart Chain). This package is a thin, typed client
 * over its public REST + WebSocket API.
 *
 *     import { Client } from "@ctg-exchange/sdk";
 *
 *     const client = new Client({ apiKey, apiSecret });
 *     const balances = await client.getBalances();
 *
 * Monetary values are JSON strings (the decimal contract) — see
 * `types`. Withdrawals are intentionally not part of the API.
 */

export { Client, DEFAULT_BASE_URL } from "./rest.js";
export type { ClientOptions, FetchLike } from "./rest.js";

export {
  DEFAULT_WS_BASE_URL,
  MarketDataStream,
  UserStream,
  parseFrame,
} from "./ws.js";
export type { StreamOptions, UserStreamOptions } from "./ws.js";

export {
  CtgExchangeError,
  ApiError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  errorFromResponse,
} from "./errors.js";

export {
  restCanonicalString,
  restHeaders,
  sha256Hex,
  signRest,
  signWsAuth,
  wsAuthMessage,
} from "./signing.js";

export type * from "./types.js";

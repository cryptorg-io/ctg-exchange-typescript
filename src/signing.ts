/**
 * HMAC-SHA256 request signing for the CTG.EXCHANGE API.
 *
 * Two signing schemes share one key secret:
 *
 * REST — the canonical string is four newline-joined fields:
 *
 *     <ts>\n<METHOD>\n<request-uri>\n<hex sha256 of body>
 *
 * WebSocket — the in-band auth frame signs the string `ws-auth\n<ts>`.
 *
 * Both produce a lowercase-hex HMAC-SHA256 keyed by the API key secret.
 */

import { createHash, createHmac } from "node:crypto";

/** Hex SHA-256 of a request body. `sha256("")` for an empty body. */
export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Build the four-field canonical string a REST signature covers.
 *
 * `requestUri` is the path plus query string exactly as sent on the
 * request line, e.g. `/api/v1/me/orders/CTGUSDT?limit=50`.
 */
export function restCanonicalString(
  ts: number | string,
  method: string,
  requestUri: string,
  body = "",
): string {
  return [String(ts), method.toUpperCase(), requestUri, sha256Hex(body)].join(
    "\n",
  );
}

/** Lowercase-hex HMAC-SHA256 of the REST canonical string. */
export function signRest(
  secret: string,
  ts: number | string,
  method: string,
  requestUri: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(restCanonicalString(ts, method, requestUri, body))
    .digest("hex");
}

/**
 * The three signed headers a private REST request must carry.
 *
 * `ts` defaults to the current Unix time in seconds; the server rejects
 * timestamps outside its signature window (default 30s), so keep the
 * local clock in sync.
 */
export function restHeaders(
  keyId: string,
  secret: string,
  method: string,
  requestUri: string,
  body = "",
  ts: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  return {
    "X-API-Key": keyId,
    "X-Timestamp": String(ts),
    "X-Signature": signRest(secret, ts, method, requestUri, body),
  };
}

/** Lowercase-hex HMAC-SHA256 over `ws-auth\n<ts>`. */
export function signWsAuth(secret: string, ts: number | string): string {
  return createHmac("sha256", secret).update(`ws-auth\n${ts}`).digest("hex");
}

/** The signed `auth` frame to send first on the private WebSocket stream. */
export function wsAuthMessage(
  keyId: string,
  secret: string,
  ts: number = Math.floor(Date.now() / 1000),
): { op: "auth"; args: [string, number, string] } {
  return { op: "auth", args: [keyId, ts, signWsAuth(secret, ts)] };
}

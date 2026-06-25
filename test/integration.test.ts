/**
 * Live, read-only integration tests against a real CTG.EXCHANGE API.
 *
 * These run only when `CTG_EXCHANGE_API_KEY` / `CTG_EXCHANGE_API_SECRET` are
 * set; otherwise the whole suite is skipped. A local `.env` file in the
 * package root (gitignored) is loaded as a convenience for local runs.
 *
 * Read-only by design: market-data and account *read* endpoints only.
 * They never place, modify or cancel an order.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "../src/rest.js";

const envPath = new URL("../.env", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const apiKey = process.env.CTG_EXCHANGE_API_KEY;
const apiSecret = process.env.CTG_EXCHANGE_API_SECRET;
const baseUrl = process.env.CTG_EXCHANGE_BASE_URL ?? "https://api.ctg.exchange";
const enabled = Boolean(apiKey && apiSecret);

describe.skipIf(!enabled)("live integration (read-only)", () => {
  const client = new Client({ apiKey, apiSecret, baseUrl });

  it("lists symbols", async () => {
    expect(Array.isArray(await client.getSymbols())).toBe(true);
  });

  it("lists tickers", async () => {
    expect(Array.isArray(await client.getTickers())).toBe(true);
  });

  it("reads balances (signed)", async () => {
    expect(Array.isArray(await client.getBalances())).toBe(true);
  });

  it("reads the fee snapshot (signed)", async () => {
    expect(await client.getFees()).toBeTruthy();
  });
});

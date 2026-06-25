/**
 * REST client wiring — offline, against an injected mock `fetch`.
 *
 * These tests never touch the network. They prove the client signs the
 * exact request it sends: the canonical request-uri includes the query
 * string, and the body hash covers the exact bytes on the wire.
 */

import { describe, expect, it } from "vitest";
import { Client } from "../src/rest.js";
import {
  CtgExchangeError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "../src/errors.js";
import { signRest } from "../src/signing.js";

const BASE = "https://api.example.com";

function mockClient(
  handler: (url: string, init: RequestInit) => Response,
  withKeys = true,
): { client: Client; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (
    url: string,
    init: RequestInit,
  ): Promise<Response> => {
    calls.push({ url, init });
    return handler(url, init);
  };
  const client = new Client({
    ...(withKeys ? { apiKey: "ak_test", apiSecret: "sk_test" } : {}),
    baseUrl: BASE,
    fetch: fetchImpl,
  });
  return { client, calls };
}

const headersOf = (init: RequestInit): Record<string, string> =>
  init.headers as Record<string, string>;

describe("REST client", () => {
  it("sends public requests unsigned", async () => {
    const { client, calls } = mockClient(
      () => new Response(JSON.stringify([{ symbol: "CTGUSDT" }])),
    );
    const symbols = await client.getSymbols();
    expect(symbols[0]?.symbol).toBe("CTGUSDT");
    expect(headersOf(calls[0]!.init)["X-Signature"]).toBeUndefined();
  });

  it("signs a GET with the query string in the canonical uri", async () => {
    const { client, calls } = mockClient(() => new Response("[]"));
    await client.getOrders("CTGUSDT", { status: "open", limit: 50 });

    const { url, init } = calls[0]!;
    expect(url).toBe(
      `${BASE}/api/v1/me/orders/CTGUSDT?status=open&limit=50`,
    );
    const headers = headersOf(init);
    const requestUri = url.slice(BASE.length);
    expect(headers["X-Signature"]).toBe(
      signRest("sk_test", headers["X-Timestamp"]!, "GET", requestUri, ""),
    );
  });

  it("signs a POST over the exact body bytes sent", async () => {
    const { client, calls } = mockClient(
      () => new Response(JSON.stringify({ order: { id: "o1" }, trades: [] })),
    );
    await client.placeOrder("CTGUSDT", {
      side: "buy",
      type: "limit",
      price: "100.5",
      qty: "2",
      clientOrderId: "cid-1",
    });

    const { url, init } = calls[0]!;
    const headers = headersOf(init);
    expect(headers["X-Signature"]).toBe(
      signRest(
        "sk_test",
        headers["X-Timestamp"]!,
        "POST",
        url.slice(BASE.length),
        init.body as string,
      ),
    );
  });

  it("unwraps the {order,trades} envelope on modifyOrder", async () => {
    const { client } = mockClient(
      () =>
        new Response(
          JSON.stringify({
            order: { id: "o1", status: "open", price: "10.50" },
            trades: [],
          }),
        ),
    );
    const order = await client.modifyOrder("CTGUSDT", "o1", {
      newPrice: "10.50",
      newQty: "0.12",
    });
    expect(order.id).toBe("o1");
    expect(order.price).toBe("10.50");
  });

  it("parses a bare order on cancelOrder", async () => {
    const { client } = mockClient(
      () => new Response(JSON.stringify({ id: "o1", status: "canceled" })),
    );
    const order = await client.cancelOrder("CTGUSDT", "o1");
    expect(order.status).toBe("canceled");
  });

  it("throws on a private call without credentials", async () => {
    const { client } = mockClient(() => new Response("[]"), false);
    await expect(client.getBalances()).rejects.toBeInstanceOf(CtgExchangeError);
  });

  it("maps a 400 to BadRequestError with the request id", async () => {
    const { client } = mockClient(
      () =>
        new Response(
          JSON.stringify({ error: "bad", message: "no", request_id: "r1" }),
          { status: 400 },
        ),
    );
    await expect(client.getSymbols()).rejects.toMatchObject({
      constructor: BadRequestError,
      statusCode: 400,
      requestId: "r1",
    });
  });

  it("maps a 401 to AuthenticationError", async () => {
    const { client } = mockClient(
      () => new Response(JSON.stringify({ error: "bad key" }), { status: 401 }),
    );
    await expect(client.getBalances()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("exposes Retry-After on a 429", async () => {
    const { client } = mockClient(
      () =>
        new Response(JSON.stringify({ error: "rate" }), {
          status: 429,
          headers: { "Retry-After": "7" },
        }),
    );
    await expect(client.getSymbols()).rejects.toMatchObject({
      constructor: RateLimitError,
      retryAfter: 7,
    });
  });
});

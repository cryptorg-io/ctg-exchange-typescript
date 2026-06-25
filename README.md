# CTG.EXCHANGE TypeScript SDK

TypeScript / JavaScript client for the
[CTG.EXCHANGE](https://ctg.exchange) exchange API — a thin, typed wrapper
over the public REST + WebSocket interface.

## Install

```sh
npm install @ctgexchange/sdk
```

Requires Node.js 18+. Ships ESM and CommonJS builds with type
declarations.

## Quick start

### Public market data — no key needed

```ts
import { Client } from "@ctgexchange/sdk";

const client = new Client();

for (const s of await client.getSymbols()) {
  console.log(s.symbol, s.tick_size);
}

const book = await client.getOrderBook("CTGUSDT");
console.log(book.bids[0]?.price, book.asks[0]?.price);
```

### Private account & trading

API keys are created in the CTG.EXCHANGE web app (Account → API keys). Read
them from the environment — never hard-code them.

```ts
import { Client } from "@ctgexchange/sdk";

const client = new Client({
  apiKey: process.env.CTG_EXCHANGE_API_KEY,
  apiSecret: process.env.CTG_EXCHANGE_API_SECRET,
});

for (const balance of await client.getBalances()) {
  console.log(balance.asset, balance.available);
}

const { order } = await client.placeOrder("CTGUSDT", {
  side: "buy",
  type: "limit",
  price: "100.00",
  qty: "1",
});
console.log(order.id, order.status);
```

### WebSocket streams

```ts
import { MarketDataStream } from "@ctgexchange/sdk";

const stream = new MarketDataStream({ channels: ["trades@CTGUSDT"] });
for await (const msg of stream) {
  console.log(msg.channel, msg.type, msg.data);
}
```

The private `UserStream` takes `apiKey` / `apiSecret` and authenticates
in-band with a signed first frame. Subscribe to any of `orders`,
`trades`, `balances`:

```ts
import { UserStream } from "@ctgexchange/sdk";

const stream = new UserStream({
  apiKey: process.env.CTG_EXCHANGE_API_KEY!,
  apiSecret: process.env.CTG_EXCHANGE_API_SECRET!,
  channels: ["orders", "balances"],
});
for await (const msg of stream) {
  console.log(msg.channel, msg.type, msg.data);
}
```

Both streams auto-reconnect and re-subscribe on a dropped socket.

## The decimal contract

Every monetary value — `price`, `qty`, `volume`, fee amounts — is a
JSON **string** (`"3500.55"`), never a number. This SDK keeps those
fields as `string`: that is lossless and leaves the choice of
big-decimal library to you. Never `Number()` them blindly.

## Errors

Non-2xx responses throw a typed error — `BadRequestError`,
`AuthenticationError`, `PermissionDeniedError`, `NotFoundError`,
`RateLimitError`, `ServerError` — all subclasses of `ApiError`. Each
carries `statusCode` and the API's `requestId`; `RateLimitError` adds
`retryAfter`. Pass `maxRetries` to `Client` to auto-retry `429`s.

## What this SDK does not do

Withdrawals are not part of the CTG.EXCHANGE API and not in this SDK — they
require a wallet signature and happen only in the web app.

## Development

```sh
npm install
npm run typecheck
npm test          # offline tests run with no credentials
npm run build
```

Integration tests run only when `CTG_EXCHANGE_API_KEY` / `CTG_EXCHANGE_API_SECRET`
are set, and are read-only — they never place orders.

## Links

- Docs: <https://docs.ctg.exchange>
- API reference: <https://docs.ctg.exchange/api/reference/>
- Security policy: [SECURITY.md](SECURITY.md)

## License

[Apache-2.0](LICENSE)

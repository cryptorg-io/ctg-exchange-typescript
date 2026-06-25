/**
 * Streaming market data and private account updates over WebSocket.
 *
 *     npx tsx examples/websocket-stream.ts
 *
 * The public stream needs no credentials. The private stream reads
 * CTG_EXCHANGE_API_KEY / CTG_EXCHANGE_API_SECRET from the environment.
 */

import { MarketDataStream, UserStream } from "../src/index.js";

async function watchMarketData(): Promise<void> {
  const stream = new MarketDataStream({
    channels: ["trades@CTGUSDT", "ticker@CTGUSDT"],
  });
  let count = 0;
  for await (const message of stream) {
    console.log(`[public] ${message.channel}/${message.type}`, message.data);
    if (++count >= 10) break;
  }
  stream.close();
}

async function watchAccount(): Promise<void> {
  const apiKey = process.env.CTG_EXCHANGE_API_KEY;
  const apiSecret = process.env.CTG_EXCHANGE_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.log("[private] set CTG_EXCHANGE_API_KEY / CTG_EXCHANGE_API_SECRET to run");
    return;
  }

  const stream = new UserStream({
    apiKey,
    apiSecret,
    channels: ["orders", "balances"],
  });
  let count = 0;
  for await (const message of stream) {
    console.log(`[private] ${message.channel}/${message.type}`, message.data);
    if (++count >= 10) break;
  }
  stream.close();
}

async function main(): Promise<void> {
  await watchMarketData();
  await watchAccount();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

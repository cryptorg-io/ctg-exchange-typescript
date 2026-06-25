/**
 * Public market data — no API key needed.
 *
 *     npx tsx examples/market-data.ts
 */

import { Client } from "../src/index.js";

async function main(): Promise<void> {
  const client = new Client();

  const symbols = await client.getSymbols();
  console.log(`${symbols.length} trading symbols`);
  for (const s of symbols.slice(0, 5)) {
    console.log(`  ${s.symbol}: tick=${s.tick_size} step=${s.step_size}`);
  }

  const first = symbols[0];
  if (!first) return;

  const ticker = await client.getTicker(first.symbol);
  console.log(`\n${first.symbol} last price: ${ticker.price}`);

  const book = await client.getOrderBook(first.symbol);
  console.log(
    `best bid/ask: ${book.bids[0]?.price} / ${book.asks[0]?.price}`,
  );

  for (const trade of await client.getTrades(first.symbol, 5)) {
    console.log(`  trade ${trade.price} x ${trade.qty}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

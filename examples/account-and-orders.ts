/**
 * Private account access and order placement.
 *
 *     export CTG_EXCHANGE_API_KEY=ak_...
 *     export CTG_EXCHANGE_API_SECRET=sk_...
 *     npx tsx examples/account-and-orders.ts
 *
 * This example reads balances and fees. Order placement is shown but
 * commented out — uncomment it only when you intend to send a real
 * order to a real exchange.
 */

import { Client } from "../src/index.js";

async function main(): Promise<void> {
  const apiKey = process.env.CTG_EXCHANGE_API_KEY;
  const apiSecret = process.env.CTG_EXCHANGE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("set CTG_EXCHANGE_API_KEY and CTG_EXCHANGE_API_SECRET");
  }

  const client = new Client({ apiKey, apiSecret, maxRetries: 3 });

  console.log("Balances:");
  for (const balance of await client.getBalances()) {
    console.log(
      `  ${balance.asset}: ${balance.available} available, ` +
        `${balance.reserved} reserved`,
    );
  }

  const fees = await client.getFees();
  console.log(`\nFees: taker=${fees.taker_fee_bps} maker=${fees.maker_fee_bps}`);

  // --- Placing an order (sends a REAL order) ---------------------------
  // const result = await client.placeOrder("CTGUSDT", {
  //   side: "buy",
  //   type: "limit",
  //   price: "100.00",
  //   qty: "1",
  //   // clientOrderId is auto-generated for safe retries.
  // });
  // console.log("Placed:", result.order.id, result.order.status);
  //
  // await client.cancelOrder("CTGUSDT", result.order.id);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

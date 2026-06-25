/**
 * WebSocket frame parsing — only data frames reach the consumer.
 */

import { describe, expect, it } from "vitest";
import { parseFrame } from "../src/ws.js";

describe("parseFrame", () => {
  it("parses a snapshot frame", () => {
    const msg = parseFrame(
      JSON.stringify({
        type: "snapshot",
        channel: "orderbook",
        symbol: "CTGUSDT",
        data: { last_update_id: 1 },
      }),
    );
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe("snapshot");
    expect(msg?.channel).toBe("orderbook");
    expect(msg?.symbol).toBe("CTGUSDT");
  });

  it("parses an update frame", () => {
    const msg = parseFrame(
      JSON.stringify({ type: "update", channel: "ticker", data: {} }),
    );
    expect(msg?.type).toBe("update");
  });

  it("skips a subscribe ack", () => {
    expect(
      parseFrame(JSON.stringify({ type: "subscribed", channels: ["x"] })),
    ).toBeNull();
  });

  it("skips an auth reply", () => {
    expect(parseFrame(JSON.stringify({ op: "auth", success: true }))).toBeNull();
  });

  it("skips malformed frames", () => {
    expect(parseFrame("not json")).toBeNull();
    expect(parseFrame('"a bare string"')).toBeNull();
    expect(parseFrame("[1,2,3]")).toBeNull();
  });
});

/**
 * The signing implementation must reproduce the cross-language vectors.
 *
 * `signing-vectors.json` is the canonical fixture shared by every
 * CTG.EXCHANGE SDK (vendored from `sdk/spec/`). Reproducing every
 * `expected_signature` here proves this SDK signs identically to the
 * others and to the server.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  restCanonicalString,
  sha256Hex,
  signRest,
  signWsAuth,
} from "../src/signing.js";

interface RestVector {
  name: string;
  ts: number;
  method: string;
  request_uri: string;
  body: string;
  body_sha256: string;
  canonical_string: string;
  expected_signature: string;
}

interface WsVector {
  name: string;
  ts: number;
  expected_signature: string;
}

const vectors = JSON.parse(
  readFileSync(new URL("./signing-vectors.json", import.meta.url), "utf8"),
) as {
  credentials: { secret: string };
  rest: RestVector[];
  ws_auth: WsVector[];
};

const secret = vectors.credentials.secret;

describe("REST signing vectors", () => {
  for (const c of vectors.rest) {
    it(c.name, () => {
      expect(sha256Hex(c.body)).toBe(c.body_sha256);
      expect(
        restCanonicalString(c.ts, c.method, c.request_uri, c.body),
      ).toBe(c.canonical_string);
      expect(
        signRest(secret, c.ts, c.method, c.request_uri, c.body),
      ).toBe(c.expected_signature);
    });
  }
});

describe("WebSocket auth signing vectors", () => {
  for (const c of vectors.ws_auth) {
    it(c.name, () => {
      expect(signWsAuth(secret, c.ts)).toBe(c.expected_signature);
    });
  }
});

it("hashes an empty body to sha256(\"\")", () => {
  expect(sha256Hex("")).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

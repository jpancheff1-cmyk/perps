import assert from "node:assert/strict";
import test from "node:test";
import { nextBeams } from "../lib/trade-beam.ts";
import type { ActivityItem } from "../lib/types.ts";

function fill(id: string, coin: string): ActivityItem {
  return {
    id,
    source: "trading.exe",
    type: "fill",
    title: id.startsWith("paper-") ? `PAPER ${coin} long` : `${coin} long`,
    body: null,
    tradeId: coin,
    trade: { coin, side: "long", leverage: 5, size: 1.5, entry: 100, exit: null, stop: 90, target: 105, pnlUsd: null, pnlPct: null, status: "open" },
    ts: 1,
  };
}

test("an executed fill triggers one beam and a repeat does not", () => {
  const items = [
    fill("paper-1", "BTC"),
    { id: "chat-1", source: "you", type: "chat", title: "hi", body: "hello", tradeId: null, trade: null, ts: 2 },
    { id: "note-1", source: "paperboy", type: "status", title: "scan", body: "none", tradeId: null, trade: null, ts: 3 },
  ] as ActivityItem[];
  const seen = new Set<string>();
  const first = nextBeams(items, [{ symbol: "PF_XBTUSD", side: "long", size: 1.5 }], seen);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.paper, true);
  assert.equal(first[0]?.symbol, "PF_XBTUSD");
  assert.equal(first[0]?.coin, "BTC");
  assert.equal(first[0]?.size, 1.5);
  for (const beam of first) seen.add(beam.id);
  assert.equal(nextBeams(items, [{ symbol: "PF_XBTUSD", side: "long", size: 1.5 }], seen).length, 0);
  const opened = nextBeams([], [{ symbol: "PF_SOLUSD", side: "long", size: 2 }], seen);
  assert.equal(opened.length, 1);
  assert.equal(opened[0]?.symbol, "PF_SOLUSD");
  assert.equal(opened[0]?.paper, false);
});

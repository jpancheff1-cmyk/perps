import assert from "node:assert/strict";
import test from "node:test";
import { parseFuturesTickers } from "../lib/futures-quotes.ts";

test("futures quotes use the live Kraken mark and 24h change", async () => {
  const response = await fetch("https://futures.kraken.com/derivatives/api/v3/tickers", {
    headers: { Accept: "application/json" },
  });
  assert.equal(response.ok, true);
  const json = (await response.json()) as { tickers?: Record<string, unknown>[] };
  const raw = json.tickers?.find((ticker) => ticker.symbol === "PF_XBTUSD");
  assert.ok(raw);
  const parsed = parseFuturesTickers(json).find((quote) => quote.coin === "BTC");
  assert.ok(parsed);
  const mark = Number(raw.markPrice);
  const last = Number(raw.last);
  assert.equal(parsed.price, Number.isFinite(mark) ? mark : last);
  assert.equal(parsed.change24, Number(raw.change24h));
  assert.equal(parseFuturesTickers(json).some((quote) => quote.coin === "CRO"), false);
});

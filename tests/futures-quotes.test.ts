import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseFuturesTickers, parseTickerPrices, TICKER_PRICE_TTL_MS } from "../lib/futures-quotes.ts";

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

test("position prices use the public mark for every contract, including ones outside the coin bar", () => {
  const parsed = parseTickerPrices({
    tickers: [
      { symbol: "PF_NEARUSD", markPrice: 3.001, last: 2.99 },
      { symbol: "pf_xbtusd", last: "100" },
      { symbol: "PI_XRPUSD", markPrice: "0.51", last: "0.5" },
      { symbol: "PF_SOLUSD" },
    ],
  });
  assert.deepEqual(parsed, [
    { symbol: "PF_NEARUSD", price: 3.001 },
    { symbol: "PF_XBTUSD", price: 100 },
    { symbol: "PI_XRPUSD", price: 0.51 },
  ]);
  assert.ok(TICKER_PRICE_TTL_MS >= 5_000 && TICKER_PRICE_TTL_MS <= 10_000);
  const panel = fs.readFileSync(new URL("../components/trades-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /price \{formatPrice\(row\.mark\)\}/);
  assert.equal(panel.includes("mark {formatPrice"), false);
});

test("live NEAR ticker mark is the price the desk will show", async () => {
  const response = await fetch("https://futures.kraken.com/derivatives/api/v3/tickers", {
    headers: { Accept: "application/json" },
  });
  assert.equal(response.ok, true);
  const json = (await response.json()) as { tickers?: Record<string, unknown>[] };
  const raw = json.tickers?.find((ticker) => ticker.symbol === "PF_NEARUSD");
  assert.ok(raw);
  const parsed = parseTickerPrices(json).find((quote) => quote.symbol === "PF_NEARUSD");
  assert.ok(parsed);
  const mark = Number(raw.markPrice);
  const last = Number(raw.last);
  assert.equal(parsed.price, Number.isFinite(mark) ? mark : last);
  assert.notEqual(parsed.price, null);
});

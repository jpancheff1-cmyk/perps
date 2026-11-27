import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildOpenFutures } from "../lib/futures-book.ts";
import { demoDesk } from "../lib/demo-desk.ts";
import { advancePaper, blankSession, ensureOpen, sizePaper, stepPaper } from "../lib/paper.ts";
import { clearPaper, readPaper, resetPaperStoreForTests, writePaper } from "../lib/paper-store.ts";
import { paperView } from "../lib/paper-view.ts";

test("paper size uses 3% risk, 5x, and a $1,000 notional cap", () => {
  const sized = sizePaper(100, 1, 3250);
  assert.ok(sized);
  assert.equal(sized.stopDistance, 2);
  assert.equal(sized.notional, 1000);
  assert.ok(sized.notional <= 1000);
  assert.ok(sized.notional <= 3250 * 5);
  assert.ok(sized.leverage <= 5);
  assert.ok(sized.riskUsd <= 3250 * 0.03 + 1e-9);
  assert.equal(sized.size, 10);
});

test("paper lifecycle takes profit, trails, stops out, and leaves one open", () => {
  const seeds = [
    { coin: "SOL", entry: 100, atr: 1, role: "winner" as const },
    { coin: "ETH", entry: 100, atr: 2, role: "loser" as const },
    { coin: "BTC", entry: 100, atr: 1, role: "open" as const },
  ];
  let session = blankSession(seeds, 0);
  for (let step = 0; step < 16; step += 1) session = stepPaper(session, seeds, step + 1);
  const sol = session.closed.filter((close) => close.coin === "SOL");
  assert.equal(sol.some((close) => close.reason === "tp"), true);
  assert.equal(sol.some((close) => close.reason === "trail"), true);
  assert.equal(session.closed.some((close) => close.coin === "ETH" && close.reason === "stop"), true);
  assert.equal(session.positions.some((position) => position.coin === "BTC"), true);
  assert.equal(session.positions.some((position) => position.coin === "ETH"), false);
  assert.ok(session.curve.length > 2);
  session.positions = [];
  session = ensureOpen(session, seeds, 20);
  assert.equal(session.positions.some((position) => position.coin === "BTC"), true);
});

test("paper view keeps an open trade on the desk with stop, tp, and trail", () => {
  const seeds = [
    { coin: "SOL", entry: 100, atr: 1, role: "winner" as const },
    { coin: "ETH", entry: 200, atr: 2, role: "loser" as const },
    { coin: "BTC", entry: 60000, atr: 800, role: "open" as const },
  ];
  const session = advancePaper(blankSession(seeds, 1), seeds, 2);
  const btc = session.positions.find((position) => position.coin === "BTC");
  assert.ok(btc);
  assert.equal(btc.side, "long");
  assert.ok(btc.size > 0);
  const view = paperView(demoDesk(2), session);
  assert.equal(view.account.positions.some((position) => position.symbol === "PF_XBTUSD"), true);
  const book = buildOpenFutures(view.account.positions, view.account.orders);
  const row = book.rows.find((item) => item.symbol === "PF_XBTUSD");
  assert.ok(row);
  assert.equal(row.entry, 60000);
  assert.ok(row.mark != null);
  assert.ok(row.stop != null && row.stop < 60000);
  assert.ok(row.target != null && Math.abs(row.target - 60000 * 1.05) < 1e-6);
  assert.equal(row.pnlUsd, 0);
  const panel = fs.readFileSync(new URL("../components/trades-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /PAPER/);
  assert.match(panel, /trail/);
});

test("paper session is stored apart from real trades and equity", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-paper-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  resetPaperStoreForTests();
  try {
    writePaper(blankSession([{ coin: "SOL", entry: 100, atr: 1, role: "winner" }], 1));
    assert.equal(fs.existsSync(path.join(dir, "paper.json")), true);
    for (const name of ["trades.json", "equity.json", "performance.json", "activity.json"]) {
      assert.equal(fs.existsSync(path.join(dir, name)), false, name);
    }
    clearPaper();
    assert.equal(readPaper(), null);
    assert.equal(fs.existsSync(path.join(dir, "paper.json")), false);
  } finally {
    if (previous == null) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    resetPaperStoreForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("paper mode never references a private Kraken endpoint or a key", () => {
  const files = ["lib/paper.ts", "lib/paper-store.ts", "lib/paper-runner.ts", "lib/paper-view.ts", "app/api/paper/route.ts"];
  for (const file of files) {
    const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(/kraken-trade|KRAKEN_|APIKey|sendorder|openpositions|api\/v3|from ["']\.\/kraken|from ["']@\/lib\/kraken/.test(text), false, file);
  }
  const runner = fs.readFileSync(new URL("../lib/paper-runner.ts", import.meta.url), "utf8");
  assert.match(runner, /api\/charts\/v1\/trade/);
});

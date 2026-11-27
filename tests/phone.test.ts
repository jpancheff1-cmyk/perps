import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function read(path: string) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phone layout keeps the viewport, a closable dock, and a lighter background", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /initialScale:\s*1/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(layout, /JetBrains_Mono\(/);
  assert.equal(layout.includes("Roboto"), false);

  const desk = read("components/desk.tsx");
  assert.match(desk, /fui-grid/);
  assert.match(desk, /safe-area-inset-bottom/);
  assert.match(desk, /get\("demo"\) === "1"/);
  assert.equal(desk.includes(">DEMO<"), false);
  assert.equal(desk.includes("pspspsps"), false);
  assert.equal(desk.includes(">PS<"), false);
  assert.match(desk, /Mission Control/);
  assert.equal(desk.includes("State-space"), false);
  assert.equal(desk.includes("Decision trace"), false);
  assert.equal(desk.includes('placeholder="SEARCH"'), false);
  assert.match(desk, /Signal watch/);
  assert.equal(desk.includes("phase portrait"), false);
  assert.equal(desk.includes("Directional · hedge"), false);
  assert.equal(desk.includes('tag="EDGE"'), false);
  assert.equal(desk.includes('tag="FAIR-P"'), false);
  const bots = read("components/bots-strip.tsx");
  assert.equal(bots.includes('label="10x"'), false);
  assert.match(bots, /Paused/);

  const strip = read("components/kraken-strip.tsx");
  assert.equal(/read-only/i.test(strip), false);

  const dock = read("components/activity-stream.tsx");
  assert.match(dock, /sheetOpen/);
  assert.match(dock, /aria-label="Dock"/);
  assert.match(dock, />\s*Close\s*</);

  const coins = read("components/coin-field.tsx");
  assert.match(coins, /phone \? 12 : 32/);
  assert.match(coins, /prefers-reduced-motion: reduce/);
  assert.match(coins, /md:opacity-55/);

  const stop = read("components/force-stop.tsx");
  assert.match(stop, /setPointerCapture/);
  assert.match(stop, /onPointerCancel=\{stopHold\}/);
  assert.match(stop, /2000/);
  assert.match(stop, /id="force-stop-hold" className="sr-only"/);
  assert.equal(stop.includes("Type FORCE STOP"), false);
  assert.equal(stop.includes("<input"), false);

  const css = read("app/globals.css");
  assert.match(css, /ticker 80s linear infinite/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /text-size-adjust:\s*100%/);
  assert.match(css, /\.g-wallet \{ order: 1; \}/);
  assert.match(css, /\.g-chat \{/);
  assert.match(css, /--keyboard-inset/);
  assert.match(css, /safe-area-inset-top/);
  assert.equal(css.includes("font-mono"), false);
  assert.equal(css.includes("Roboto_Mono"), false);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const hits: string[] = [];
  for (const folder of ["app", "components"]) walkFonts(path.join(root, folder), hits);
  assert.deepEqual(hits, []);
});

function walkFonts(dir: string, hits: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkFonts(full, hits);
    else if (/\.(tsx|css)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      const families = [...text.matchAll(/font-family:\s*([^;]+)/g)].map((match) => match[1].trim());
      if (/font-mono|Roboto_Mono|ui-monospace|monospace/.test(text) || families.some((family) => family !== "inherit")) hits.push(full);
    }
  }
}

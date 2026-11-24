import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path: string) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phone layout keeps the viewport, a closable dock, and a lighter background", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /initialScale:\s*1/);
  assert.match(layout, /viewportFit:\s*"cover"/);

  const desk = read("components/desk.tsx");
  assert.match(desk, /md:w-\[calc\(100%-412px\)\]/);
  assert.match(desk, /safe-area-inset-bottom/);
  assert.match(desk, /md:pb-8/);

  const dock = read("components/activity-stream.tsx");
  assert.match(dock, /md:w-\[380px\]/);
  assert.match(dock, /md:top-4 md:right-4 md:bottom-4/);
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
  assert.match(stop, /confirm: "FORCE STOP"/);

  const css = read("app/globals.css");
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /safe-area-inset-top/);
});

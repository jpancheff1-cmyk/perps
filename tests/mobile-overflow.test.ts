import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const DESK = process.env.DESK_URL ?? "http://127.0.0.1:3847";

async function deskUp() {
  try {
    return (await fetch(`${DESK}/login`)).ok;
  } catch {
    return false;
  }
}

test("390x844 desk does not scroll sideways", async (t) => {
  if (!(await deskUp())) {
    t.skip("desk is not running");
    return;
  }
  const chrome = await launchChrome();
  try {
    const page = await openPage(chrome.port);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.send("Page.navigate", { url: `${DESK}/login` });
    await wait(700);
    const login = await page.send("Runtime.evaluate", {
      expression: `fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:${JSON.stringify(process.env.DASHBOARD_PASSWORD ?? "desk-local-verify")}})}).then(r=>r.status)`,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.equal(login.result.value, 200);
    await page.send("Page.navigate", { url: `${DESK}/?demo=1` });
    await wait(1800);
    const measured = await page.send("Runtime.evaluate", {
      expression: `(() => {
        const root = document.documentElement;
        const orders = [".g-wallet",".g-trades",".g-phase",".g-trace",".g-state",".g-x",".g-dca",".g-feed",".g-chat"].map((selector) => {
          const node = document.querySelector(selector);
          return node ? Number(getComputedStyle(node).order) : null;
        });
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          shell: getComputedStyle(document.querySelector(".g-shell")).display,
          orders,
        };
      })()`,
      returnByValue: true,
    });
    const value = measured.result.value as { scrollWidth: number; clientWidth: number; shell: string; orders: number[] };
    assert.ok(value.scrollWidth <= value.clientWidth + 1, `scroll ${value.scrollWidth} client ${value.clientWidth}`);
    assert.equal(value.shell, "none");
    assert.deepEqual(value.orders, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    page.ws.close();
  } finally {
    chrome.kill();
  }
});

async function launchChrome() {
  const dir = mkdtempSync(path.join(tmpdir(), "desk-mobile-"));
  const port = 9333;
  const child: ChildProcess = spawn("google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    "about:blank",
  ], { stdio: "ignore" });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {
      await wait(200);
    }
  }
  return { port, kill: () => child.kill() };
}

async function openPage(port: number) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as { type: string; webSocketDebuggerUrl: string }[];
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("no page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(String(event.data));
    if (!data.id || !pending.has(data.id)) return;
    const waiter = pending.get(data.id)!;
    pending.delete(data.id);
    if (data.error) waiter.reject(new Error(JSON.stringify(data.error)));
    else waiter.resolve(data.result);
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  return {
    ws,
    send(method: string, params: Record<string, unknown> = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    },
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

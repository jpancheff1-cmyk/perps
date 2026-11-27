import fs from "fs";
import path from "path";
import type { PaperSession } from "./paper";

let cache: PaperSession | null | undefined;

function file() {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "paper.json");
}

export function resetPaperStoreForTests() {
  cache = undefined;
}

export function readPaper(): PaperSession | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file(), "utf8")) as PaperSession;
  } catch {
    cache = null;
  }
  return cache;
}

export function writePaper(session: PaperSession) {
  cache = session;
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session));
  fs.renameSync(tmp, target);
}

export function clearPaper() {
  cache = null;
  const target = file();
  if (fs.existsSync(target)) fs.rmSync(target);
}

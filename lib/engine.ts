import { COINS, findCoin, type CoinDef } from "./coins";
import { advanceWsUrl, bybitGet, currentRestBase, openMarketSocket, restCountryNote, wsUrl } from "./bybit";
import { atr, ema, intervalMs, lastNumber, macd, rsi, sessionVwap, splitCandles } from "./indicators";
import { equalClusters, fractalPivots, nearestLevels, recentPivots } from "./levels";
import { clusterLiquidations, type LiqEvent } from "./liquidations";
import { fetchKrakenAccount, notConnectedAccount } from "./kraken";
import { mergeExternalIndicators, tradingViewSource } from "./external-indicators";
import { onActivity, readActivity } from "./activity-store";
import { startOfSofiaDay } from "./time";
import { finite } from "./format";
import type {
  AccountPayload,
  Candle,
  ChartPayload,
  CoinLevels,
  CoinSnapshot,
  EngineStatus,
  IndicatorSummary,
  MarketPayload,
  Timeframe,
} from "./types";

type Ticker = {
  lastPrice: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  bid: number | null;
  ask: number | null;
  change24hPct: number | null;
  prevPrice1h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  turnover24h: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  openInterest: number | null;
  openInterestValue: number | null;
};

type OiPoint = { t: number; oi: number };

type Book = {
  meta: CoinDef;
  listed: boolean | null;
  listReason?: string;
  ticker: Ticker;
  candles: Record<Timeframe, Candle[]>;
  indicators: Record<Timeframe, IndicatorSummary>;
  levels: CoinLevels;
  oi1h: OiPoint[];
  oi4h: OiPoint[];
  oiSamples: OiPoint[];
  liqs: LiqEvent[];
  liqSeen: Set<string>;
};

type Listener = (event: string, data: unknown) => void;

const TFS: Timeframe[] = ["5m", "15m", "1h"];
const EMPTY_LEVELS: CoinLevels = {
  support: null,
  resistance: null,
  support15m: null,
  resistance15m: null,
  support1h: null,
  resistance1h: null,
  swings15m: { highs: [], lows: [] },
  swings1h: { highs: [], lows: [] },
  equalHighs: [],
  equalLows: [],
};

function log(message: string) {
  console.log(`[desk] ${message}`);
}

function emptyTicker(): Ticker {
  return {
    lastPrice: null,
    markPrice: null,
    indexPrice: null,
    bid: null,
    ask: null,
    change24hPct: null,
    prevPrice1h: null,
    high24h: null,
    low24h: null,
    volume24h: null,
    turnover24h: null,
    fundingRate: null,
    nextFundingTime: null,
    openInterest: null,
    openInterestValue: null,
  };
}

function emptyIndicator(): IndicatorSummary {
  return {
    ema9: null,
    ema15: null,
    ema21: null,
    stack: "mixed",
    rsi14: null,
    macdLine: null,
    macdSignal: null,
    macdHist: null,
    atr14: null,
    vwap: null,
  };
}

function emptyBook(meta: CoinDef): Book {
  return {
    meta,
    listed: null,
    ticker: emptyTicker(),
    candles: { "5m": [], "15m": [], "1h": [] },
    indicators: { "5m": emptyIndicator(), "15m": emptyIndicator(), "1h": emptyIndicator() },
    levels: structuredClone(EMPTY_LEVELS),
    oi1h: [],
    oi4h: [],
    oiSamples: [],
    liqs: [],
    liqSeen: new Set(),
  };
}

function bybitInterval(tf: Timeframe) {
  if (tf === "5m") return "5";
  if (tf === "15m") return "15";
  return "60";
}

function tfFromInterval(interval: string): Timeframe | null {
  if (interval === "5") return "5m";
  if (interval === "15") return "15m";
  if (interval === "60") return "1h";
  return null;
}

function parseCandles(list: unknown): Candle[] {
  if (!Array.isArray(list)) return [];
  const candles: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const candle = {
      t: Number(row[0]),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: Number(row[5]),
    };
    if ([candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite)) candles.push(candle);
  }
  candles.sort((a, b) => a.t - b.t);
  return candles;
}

function upsertCandle(list: Candle[], candle: Candle) {
  if (!list.length || candle.t > list[list.length - 1].t) {
    list.push(candle);
    if (list.length > 600) list.splice(0, list.length - 600);
    return;
  }
  if (candle.t === list[list.length - 1].t) list[list.length - 1] = candle;
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

function oiChange(rows: OiPoint[]): number | null {
  if (rows.length < 2) return null;
  const previous = rows[rows.length - 2].oi;
  const latest = rows[rows.length - 1].oi;
  if (!(previous > 0) || !Number.isFinite(latest)) return null;
  return ((latest - previous) / previous) * 100;
}

function sampleChange(samples: OiPoint[], now: number, windowMs: number): number | null {
  if (samples.length < 2) return null;
  const target = now - windowMs;
  let prior: OiPoint | null = null;
  for (const sample of samples) {
    if (sample.t <= target) prior = sample;
  }
  if (!prior || samples[0].t > target + windowMs * 0.2) return null;
  const latest = samples[samples.length - 1];
  if (!(prior.oi > 0)) return null;
  return ((latest.oi - prior.oi) / prior.oi) * 100;
}

function barChange(last: number | null, candles: Candle[], tf: Timeframe, now: number): number | null {
  if (last == null) return null;
  const { closed, forming } = splitCandles(candles, intervalMs(tf), now);
  const ref = forming ? closed.at(-1)?.c : closed.at(-2)?.c;
  if (ref == null || !(ref > 0)) return null;
  return (last / ref - 1) * 100;
}

class MarketEngine {
  private books = new Map<string, Book>();
  private listeners = new Set<Listener>();
  private running = false;
  private ws: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retryMs = 1000;
  private seenLive = false;
  private locks = new Set<string>();
  private activityUnsub: (() => void) | null = null;
  status: EngineStatus;
  account: AccountPayload = notConnectedAccount();

  constructor() {
    for (const coin of COINS) this.books.set(coin.symbol, emptyBook(coin));
    this.status = {
      ws: "connecting",
      rest: "idle",
      restBase: null,
      restMessage: null,
      updatedAt: null,
      liqEvents: 0,
      symbols: COINS.length,
      missing: [],
      candlesReady: 0,
      candlesExpected: COINS.length * TFS.length,
      startedAt: Date.now(),
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    log("market engine starting");
    this.connectWs();
    void this.bootstrap();
    setInterval(() => this.flush(), 1000);
    void this.pollAccount();
    setInterval(() => void this.pollAccount(), 20_000);
    setInterval(() => this.pruneLiqs(), 60_000);
    setInterval(() => void this.locked("kline-5m", () => this.loadKlines("5m")), 60_000);
    setInterval(() => void this.locked("kline-15m", () => this.loadKlines("15m")), 120_000);
    setInterval(() => void this.locked("kline-1h", () => this.loadKlines("1h")), 180_000);
    setInterval(() => void this.locked("oi", () => this.loadOi()), 180_000);
    this.activityUnsub = onActivity(() => this.emit("activity", readActivity()));
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener("market", this.marketSnapshot());
    listener("account", this.account);
    listener("activity", readActivity());
    return () => this.listeners.delete(listener);
  }

  marketSnapshot(): MarketPayload {
    const now = Date.now();
    this.status.restBase = currentRestBase();
    this.status.liqEvents = this.liqCount();
    this.status.missing = COINS.filter((coin) => this.books.get(coin.symbol)?.listed === false).map((coin) => coin.base);
    this.status.candlesReady = this.readyCandles();
    return {
      coins: COINS.map((coin) => this.toSnapshot(this.books.get(coin.symbol) as Book, now)),
      status: { ...this.status },
      serverTime: now,
    };
  }

  getChart(id: string, tf: Timeframe): ChartPayload | null {
    const coin = findCoin(id);
    if (!coin || !TFS.includes(tf)) return null;
    const book = this.books.get(coin.symbol) as Book;
    const candles = book.candles[tf].slice(-360);
    const { closed, forming } = splitCandles(candles, intervalMs(tf), Date.now());
    const closes = closed.map((candle) => candle.c);
    const pad = (series: (number | null)[]) => (forming ? [...series, null] : series);
    const macdSeries = macd(closes);
    return {
      base: coin.base,
      symbol: coin.symbol,
      tf,
      available: book.listed !== false,
      reason: book.listReason,
      forming: Boolean(forming),
      last: book.ticker.lastPrice,
      candles,
      ema9: pad(ema(closes, 9)),
      ema15: pad(ema(closes, 15)),
      ema21: pad(ema(closes, 21)),
      rsi: pad(rsi(closes, 14)),
      macdLine: pad(macdSeries.line),
      macdSignal: pad(macdSeries.signal),
      macdHist: pad(macdSeries.hist),
    };
  }

  private emit(event: string, data: unknown) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        /* a disconnected client should not stop the feed */
      }
    }
  }

  private flush() {
    if (!this.listeners.size) return;
    this.emit("market", this.marketSnapshot());
    this.emit("account", this.account);
  }

  private async locked(key: string, fn: () => Promise<void>) {
    if (this.locks.has(key)) return;
    this.locks.add(key);
    try {
      await fn();
    } finally {
      this.locks.delete(key);
    }
  }

  private async bootstrap() {
    this.status.rest = "loading";
    try {
      await this.loadInstruments();
    } catch (error) {
      const message = error instanceof Error ? error.message : "instrument list failed";
      this.status.restMessage = "Instrument list unavailable. Live tickers still attach.";
      log(`instruments failed: ${message.slice(0, 160)}`);
    }
    await this.locked("kline-all", () => this.loadKlines());
    await this.locked("oi", () => this.loadOi());
  }

  private async loadInstruments() {
    const found = new Map<string, { status: string; contractType: string }>();
    let cursor = "";
    for (let page = 0; page < 8; page++) {
      const query = `/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const json = await bybitGet<{ list?: { symbol: string; status: string; contractType: string }[]; nextPageCursor?: string }>(query);
      for (const row of json.result.list ?? []) {
        found.set(row.symbol, { status: row.status, contractType: row.contractType });
      }
      cursor = json.result.nextPageCursor || "";
      if (!cursor) break;
    }
    for (const coin of COINS) {
      const book = this.books.get(coin.symbol) as Book;
      const row = found.get(coin.symbol);
      if (!row) {
        book.listed = false;
        book.listReason = "Not listed on Bybit USDT linear";
      } else if (row.status !== "Trading" || row.contractType !== "LinearPerpetual") {
        book.listed = false;
        book.listReason = `${row.contractType} · ${row.status}`;
      } else {
        book.listed = true;
        book.listReason = undefined;
      }
    }
    const listed = [...this.books.values()].filter((book) => book.listed).length;
    const missing = COINS.filter((coin) => this.books.get(coin.symbol)?.listed === false).map((coin) => coin.base);
    log(`instruments ${listed} trading, missing ${missing.join(", ") || "none"} via ${currentRestBase()}`);
  }

  private async loadKlines(only?: Timeframe) {
    const timeframes = only ? [only] : TFS;
    const jobs = COINS.flatMap((coin) => timeframes.map((tf) => ({ symbol: coin.symbol, tf })));
    if (this.status.rest !== "ok") this.status.rest = "loading";
    let ok = 0;
    let failed = 0;
    let lastError = "";
    await pool(jobs, 4, async (job) => {
      try {
        const limit = job.tf === "5m" ? 500 : 400;
        const json = await bybitGet<{ list?: unknown }>(
          `/v5/market/kline?category=linear&symbol=${job.symbol}&interval=${bybitInterval(job.tf)}&limit=${limit}`,
        );
        const book = this.books.get(job.symbol) as Book;
        book.candles[job.tf] = parseCandles(json.result.list).slice(-600);
        this.recompute(book, job.tf);
        ok += 1;
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : "kline failed";
        if (/symbol/i.test(lastError)) {
          const book = this.books.get(job.symbol) as Book;
          if (book.listed !== true) {
            book.listed = false;
            book.listReason = "Bybit rejected this symbol";
          }
        }
      }
    });
    if (ok > 0) {
      this.status.rest = "ok";
      this.status.restBase = currentRestBase();
      this.status.restMessage = restCountryNote();
      this.touch();
    } else if (failed > 0 && this.status.rest !== "ok") {
      this.status.rest = "error";
      this.status.restMessage = "Bybit kline history is not reachable from this server.";
      log(`klines failed: ${lastError.slice(0, 160)}`);
    }
  }

  private async loadOi() {
    await pool(COINS, 4, async (coin) => {
      const book = this.books.get(coin.symbol) as Book;
      if (book.listed === false) return;
      for (const [intervalTime, key] of [
        ["1h", "oi1h"],
        ["4h", "oi4h"],
      ] as const) {
        try {
          const json = await bybitGet<{ list?: { openInterest: string; timestamp: string }[] }>(
            `/v5/market/open-interest?category=linear&symbol=${coin.symbol}&intervalTime=${intervalTime}&limit=6`,
          );
          const rows = (json.result.list ?? [])
            .map((row) => ({ t: Number(row.timestamp), oi: Number(row.openInterest) }))
            .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.oi))
            .sort((a, b) => a.t - b.t);
          book[key] = rows;
        } catch {
          /* keep the previous history */
        }
      }
    });
    this.touch();
  }

  private async pollAccount() {
    this.account = await fetchKrakenAccount();
  }

  private recompute(book: Book, tf: Timeframe) {
    const now = Date.now();
    const { closed } = splitCandles(book.candles[tf], intervalMs(tf), now);
    const closes = closed.map((candle) => candle.c);
    const ema9 = lastNumber(ema(closes, 9));
    const ema15 = lastNumber(ema(closes, 15));
    const ema21 = lastNumber(ema(closes, 21));
    const macdSeries = macd(closes);
    const atrSeries = atr(closed, 14);
    const stack =
      ema9 == null || ema15 == null || ema21 == null
        ? "mixed"
        : ema9 > ema15 && ema15 > ema21
          ? "up"
          : ema9 < ema15 && ema15 < ema21
            ? "down"
            : "mixed";
    book.indicators[tf] = {
      ema9,
      ema15,
      ema21,
      stack,
      rsi14: lastNumber(rsi(closes, 14)),
      macdLine: lastNumber(macdSeries.line),
      macdSignal: lastNumber(macdSeries.signal),
      macdHist: lastNumber(macdSeries.hist),
      atr14: lastNumber(atrSeries),
      vwap: sessionVwap(closed, startOfSofiaDay(new Date(now))),
    };
    if (tf === "15m" || tf === "1h") this.recomputeLevels(book);
    if (tradingViewSource.enabled) {
      void mergeExternalIndicators(book.meta.symbol, tf, book.indicators[tf]).then((summary) => {
        book.indicators[tf] = summary;
      });
    }
    this.touch();
  }

  private recomputeLevels(book: Book) {
    const now = Date.now();
    const closed15 = splitCandles(book.candles["15m"], intervalMs("15m"), now).closed;
    const closed1h = splitCandles(book.candles["1h"], intervalMs("1h"), now).closed;
    const swings15 = fractalPivots(closed15, 2);
    const swings1h = fractalPivots(closed1h, 2);
    const equalHighs = [
      ...equalClusters(swings15.highs, 0.0012, "15m"),
      ...equalClusters(swings1h.highs, 0.0012, "1h"),
    ];
    const equalLows = [
      ...equalClusters(swings15.lows, 0.0012, "15m"),
      ...equalClusters(swings1h.lows, 0.0012, "1h"),
    ];
    const price = book.ticker.lastPrice ?? closed1h.at(-1)?.c ?? closed15.at(-1)?.c ?? null;
    const near15 = nearestLevels(price, [...swings15.highs.map((level) => level.price), ...swings15.lows.map((level) => level.price)]);
    const near1h = nearestLevels(price, [
      ...swings1h.highs.map((level) => level.price),
      ...swings1h.lows.map((level) => level.price),
      ...equalHighs.filter((level) => level.timeframe === "1h").map((level) => level.price),
      ...equalLows.filter((level) => level.timeframe === "1h").map((level) => level.price),
    ]);
    const combined = nearestLevels(price, [
      ...swings15.highs.map((level) => level.price),
      ...swings15.lows.map((level) => level.price),
      ...swings1h.highs.map((level) => level.price),
      ...swings1h.lows.map((level) => level.price),
      ...equalHighs.map((level) => level.price),
      ...equalLows.map((level) => level.price),
    ]);
    book.levels = {
      support: combined.support,
      resistance: combined.resistance,
      support15m: near15.support,
      resistance15m: near15.resistance,
      support1h: near1h.support,
      resistance1h: near1h.resistance,
      swings15m: { highs: recentPivots(swings15.highs), lows: recentPivots(swings15.lows) },
      swings1h: { highs: recentPivots(swings1h.highs), lows: recentPivots(swings1h.lows) },
      equalHighs: equalHighs.slice(-8),
      equalLows: equalLows.slice(-8),
    };
  }

  private toSnapshot(book: Book, now: number): CoinSnapshot {
    const last = book.ticker.lastPrice;
    const change1h =
      last != null && book.ticker.prevPrice1h != null && book.ticker.prevPrice1h > 0
        ? (last / book.ticker.prevPrice1h - 1) * 100
        : barChange(last, book.candles["1h"], "1h", now);
    const indicators = {} as CoinSnapshot["indicators"];
    const spark = {} as CoinSnapshot["spark"];
    const change = {} as CoinSnapshot["change"];
    for (const tf of TFS) {
      const summary = book.indicators[tf];
      indicators[tf] = summary;
      const { closed } = splitCandles(book.candles[tf], intervalMs(tf), now);
      const points = closed.slice(-40).map((candle) => candle.c);
      if (last != null) points.push(last);
      spark[tf] = points;
      change[tf] = barChange(last, book.candles[tf], tf, now);
    }
    const liq =
      last != null
        ? clusterLiquidations(book.liqs, last, now)
        : { bucket: null, above: [], below: [], longNotional24h: 0, shortNotional24h: 0, count24h: 0 };
    const missing = book.listed === false;
    return {
      base: book.meta.base,
      symbol: book.meta.symbol,
      available: !missing,
      reason: missing ? book.listReason : last == null ? "Waiting for the live ticker" : undefined,
      last,
      mark: book.ticker.markPrice,
      index: book.ticker.indexPrice,
      bid: book.ticker.bid,
      ask: book.ticker.ask,
      change24hPct: book.ticker.change24hPct,
      change1hPct: change1h,
      change,
      high24h: book.ticker.high24h,
      low24h: book.ticker.low24h,
      volume24h: book.ticker.volume24h,
      turnover24h: book.ticker.turnover24h,
      fundingRate: book.ticker.fundingRate,
      nextFundingTime: book.ticker.nextFundingTime,
      openInterest: book.ticker.openInterest,
      openInterestValue: book.ticker.openInterestValue,
      oiChange1hPct: oiChange(book.oi1h) ?? sampleChange(book.oiSamples, now, 60 * 60 * 1000),
      oiChange4hPct: oiChange(book.oi4h) ?? sampleChange(book.oiSamples, now, 4 * 60 * 60 * 1000),
      spark,
      indicators,
      levels: book.levels,
      liquidations: liq,
    };
  }

  private socketOpened = false;

  private connectWs() {
    const url = wsUrl();
    let socket: WebSocket;
    try {
      socket = openMarketSocket(url);
    } catch (error) {
      log(`websocket construct failed: ${error instanceof Error ? error.message : "unknown"}`);
      advanceWsUrl();
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;
    this.socketOpened = false;
    this.status.ws = this.seenLive ? "reconnecting" : "connecting";
    socket.onopen = () => {
      this.socketOpened = true;
      this.retryMs = 1000;
      this.seenLive = true;
      this.status.ws = "live";
      this.subscribeAll(socket);
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => {
        try {
          socket.send(JSON.stringify({ op: "ping" }));
        } catch {
          /* socket will close and reconnect */
        }
      }, 20_000);
      log(`bybit public websocket live (${url})`);
    };
    socket.onmessage = (event) => {
      this.onMessage(String(event.data));
    };
    socket.onerror = () => {
      /* close handler reconnects */
    };
    socket.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      if (this.ws === socket) this.ws = null;
      if (!this.socketOpened) advanceWsUrl();
      this.status.ws = "reconnecting";
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const wait = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
    setTimeout(() => {
      if (this.running) this.connectWs();
    }, wait);
  }

  private subscribeAll(socket: WebSocket) {
    const topics: string[] = [];
    for (const coin of COINS) {
      topics.push(`tickers.${coin.symbol}`, `allLiquidation.${coin.symbol}`);
      topics.push(`kline.5.${coin.symbol}`, `kline.15.${coin.symbol}`, `kline.60.${coin.symbol}`);
    }
    for (let i = 0; i < topics.length; i += 10) {
      socket.send(JSON.stringify({ op: "subscribe", args: topics.slice(i, i + 10) }));
    }
  }

  private onMessage(raw: string) {
    let message: {
      topic?: string;
      type?: string;
      data?: unknown;
      op?: string;
      success?: boolean;
      ret_msg?: string;
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.op === "ping" || message.op === "pong" || message.op === "subscribe") {
      if (message.success === false && message.ret_msg) {
        log(`subscribe rejected: ${message.ret_msg.slice(0, 180)}`);
        const match = message.ret_msg.match(/tickers\.([A-Z0-9]+)/);
        if (match) {
          const book = this.books.get(match[1]);
          if (book && book.listed !== true) {
            book.listed = false;
            book.listReason = "Bybit websocket has no ticker for this symbol";
          }
        }
      }
      return;
    }
    if (!message.topic || message.data == null) return;
    if (message.topic.startsWith("tickers.")) {
      this.onTicker(message.topic.slice("tickers.".length), message.data);
      return;
    }
    if (message.topic.startsWith("allLiquidation.")) {
      this.onLiquidation(message.topic.slice("allLiquidation.".length), message.data);
      return;
    }
    if (message.topic.startsWith("kline.")) {
      const [, interval, symbol] = message.topic.split(".");
      const tf = tfFromInterval(interval);
      if (tf && symbol) this.onKline(symbol, tf, message.data);
    }
  }

  private onTicker(symbol: string, data: unknown) {
    const book = this.books.get(symbol);
    const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (!book || !row) return;
    const set = (key: keyof Ticker, value: number | null, scale = 1) => {
      if (value == null) return;
      book.ticker[key] = value * scale;
    };
    set("lastPrice", finite(row.lastPrice));
    set("markPrice", finite(row.markPrice));
    set("indexPrice", finite(row.indexPrice));
    set("bid", finite(row.bid1Price));
    set("ask", finite(row.ask1Price));
    set("change24hPct", finite(row.price24hPcnt), 100);
    set("prevPrice1h", finite(row.prevPrice1h));
    set("high24h", finite(row.highPrice24h));
    set("low24h", finite(row.lowPrice24h));
    set("volume24h", finite(row.volume24h));
    set("turnover24h", finite(row.turnover24h));
    set("fundingRate", finite(row.fundingRate));
    const nextFunding = finite(row.nextFundingTime);
    if (nextFunding != null) book.ticker.nextFundingTime = nextFunding;
    set("openInterest", finite(row.openInterest));
    set("openInterestValue", finite(row.openInterestValue));
    if (book.ticker.openInterest != null) {
      const last = book.oiSamples.at(-1);
      const now = Date.now();
      if (!last || now - last.t > 30_000) {
        book.oiSamples.push({ t: now, oi: book.ticker.openInterest });
        if (book.oiSamples.length > 800) book.oiSamples.shift();
      }
    }
    if (book.listed == null) book.listed = true;
    this.touch();
  }

  private onKline(symbol: string, tf: Timeframe, data: unknown) {
    const book = this.books.get(symbol);
    if (!book || !Array.isArray(data)) return;
    let confirmed = false;
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const candle: Candle = {
        t: Number(item.start),
        o: Number(item.open),
        h: Number(item.high),
        l: Number(item.low),
        c: Number(item.close),
        v: Number(item.volume),
      };
      if (![candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite)) continue;
      upsertCandle(book.candles[tf], candle);
      if (item.confirm === true || item.confirm === "true") confirmed = true;
    }
    if (confirmed) this.recompute(book, tf);
    else this.touch();
  }

  private onLiquidation(symbol: string, data: unknown) {
    const book = this.books.get(symbol);
    if (!book || !Array.isArray(data)) return;
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const price = finite(item.p);
      const qty = finite(item.v);
      const time = finite(item.T);
      if (price == null || qty == null || time == null) continue;
      const side = item.S === "Buy" ? "Buy" : "Sell";
      const key = `${time}|${price}|${qty}|${side}`;
      if (book.liqSeen.has(key)) continue;
      book.liqSeen.add(key);
      if (book.liqSeen.size > 4000) {
        const first = book.liqSeen.values().next().value;
        if (first) book.liqSeen.delete(first);
      }
      book.liqs.push({ t: time, price, qty, side, notional: price * qty });
    }
    this.touch();
  }

  private pruneLiqs() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const book of this.books.values()) {
      book.liqs = book.liqs.filter((event) => event.t >= cutoff).slice(-4000);
    }
  }

  private liqCount() {
    let count = 0;
    for (const book of this.books.values()) count += book.liqs.length;
    return count;
  }

  private readyCandles() {
    let count = 0;
    for (const book of this.books.values()) {
      for (const tf of TFS) if (book.candles[tf].length > 30) count += 1;
    }
    return count;
  }

  private touch() {
    this.status.updatedAt = Date.now();
  }
}

const globalStore = globalThis as unknown as { __perpDesk?: MarketEngine };

export function getEngine() {
  if (!globalStore.__perpDesk) globalStore.__perpDesk = new MarketEngine();
  return globalStore.__perpDesk;
}

export function startEngine() {
  const engine = getEngine();
  engine.start();
  return engine;
}

export type LiqEvent = {
  t: number;
  price: number;
  qty: number;
  side: "Buy" | "Sell";
  notional: number;
};

export type LiqCluster = {
  price: number;
  longNotional: number;
  shortNotional: number;
  count: number;
};

export function bucketWidth(price: number): number {
  const raw = price * 0.0015;
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / mag;
  const nice = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return nice * mag;
}

export function clusterLiquidations(events: LiqEvent[], refPrice: number, now: number) {
  const cutoff = now - 24 * 60 * 60 * 1000;
  const fresh = events.filter((event) => event.t >= cutoff && event.price > 0 && event.notional >= 0);
  const width = bucketWidth(refPrice);
  const map = new Map<number, LiqCluster>();
  let longNotional24h = 0;
  let shortNotional24h = 0;
  for (const event of fresh) {
    const key = Math.round(event.price / width);
    const price = key * width;
    let row = map.get(key);
    if (!row) {
      row = { price, longNotional: 0, shortNotional: 0, count: 0 };
      map.set(key, row);
    }
    if (event.side === "Sell") {
      row.longNotional += event.notional;
      longNotional24h += event.notional;
    } else {
      row.shortNotional += event.notional;
      shortNotional24h += event.notional;
    }
    row.count += 1;
  }
  const all = [...map.values()];
  const above = all
    .filter((cluster) => cluster.price > refPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);
  const below = all
    .filter((cluster) => cluster.price < refPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 8);
  return {
    bucket: width,
    above,
    below,
    longNotional24h,
    shortNotional24h,
    count24h: fresh.length,
  };
}

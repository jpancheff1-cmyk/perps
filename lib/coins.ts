export type CoinDef = {
  base: string;
  symbol: string;
  group: "major" | "alt";
};

export const MAJORS = new Set(["BTC", "ETH", "BNB", "XRP", "SOL", "TRX", "DOGE"]);

const ROWS: [string, string][] = [
  ["BTC", "BTCUSDT"],
  ["ETH", "ETHUSDT"],
  ["BNB", "BNBUSDT"],
  ["XRP", "XRPUSDT"],
  ["SOL", "SOLUSDT"],
  ["TRX", "TRXUSDT"],
  ["HYPE", "HYPEUSDT"],
  ["ZEC", "ZECUSDT"],
  ["XMR", "XMRUSDT"],
  ["DOGE", "DOGEUSDT"],
  ["LINK", "LINKUSDT"],
  ["ADA", "ADAUSDT"],
  ["XLM", "XLMUSDT"],
  ["NEAR", "NEARUSDT"],
  ["BCH", "BCHUSDT"],
  ["LTC", "LTCUSDT"],
  ["AVAX", "AVAXUSDT"],
  ["UNI", "UNIUSDT"],
  ["SUI", "SUIUSDT"],
  ["HBAR", "HBARUSDT"],
  ["TAO", "TAOUSDT"],
  ["SHIB", "SHIB1000USDT"],
  ["QNT", "QNTUSDT"],
  ["CRO", "CROUSDT"],
  ["AAVE", "AAVEUSDT"],
  ["PEPE", "1000PEPEUSDT"],
  ["CRV", "CRVUSDT"],
];

export const COINS: CoinDef[] = ROWS.map(([base, symbol]) => ({
  base,
  symbol,
  group: MAJORS.has(base) ? "major" : "alt",
}));

export function findCoin(id: string | null | undefined): CoinDef | null {
  if (!id) return null;
  const key = id.trim().toUpperCase();
  return COINS.find((coin) => coin.base === key || coin.symbol === key) ?? null;
}

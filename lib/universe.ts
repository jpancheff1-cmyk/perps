/** The engine coin list is not in this repo. These are the 27 long-running majors plus ARB, POL, STRK, FIL, and TIA. */
export const UNIVERSE = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX",
  "DOT",
  "LINK",
  "LTC",
  "BCH",
  "ATOM",
  "NEAR",
  "APT",
  "SUI",
  "OP",
  "INJ",
  "SEI",
  "WLD",
  "PEPE",
  "UNI",
  "AAVE",
  "RENDER",
  "FET",
  "STX",
  "IMX",
  "TON",
  "ARB",
  "POL",
  "STRK",
  "FIL",
  "TIA",
] as const;

export type UniverseCoin = (typeof UNIVERSE)[number];

export function perpSymbol(coin: string) {
  if (coin === "BTC") return "PF_XBTUSD";
  return `PF_${coin}USD`;
}

export function coinFromPerp(symbol: string) {
  let name = symbol.toUpperCase().replace(/^(PF_|PI_|FI_|FF_)/, "");
  name = name.replace(/(USDT|USDC|USD)$/, "");
  if (name === "XBT") return "BTC";
  return name || symbol.toUpperCase();
}

/** Engine order from paper_trend. That file is not in this repo; this is the list the desk was given. */
export const UNIVERSE = [
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "HYPE",
  "ZEC",
  "DOGE",
  "LINK",
  "ADA",
  "XLM",
  "NEAR",
  "BCH",
  "LTC",
  "AVAX",
  "UNI",
  "SUI",
  "HBAR",
  "TAO",
  "AAVE",
  "PEPE",
  "CRV",
  "INJ",
  "ENA",
  "FET",
  "SEI",
  "DOT",
  "ARB",
  "POL",
  "STRK",
  "FIL",
  "TIA",
  "PUMP",
  "DASH",
  "ONDO",
  "RUNE",
  "TRUMP",
  "PORTAL",
  "ICP",
  "ATOM",
  "ALGO",
  "MON",
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

export function priceOiRead(pricePct: number | null, oiPct: number | null): string {
  if (pricePct == null || oiPct == null || !Number.isFinite(pricePct) || !Number.isFinite(oiPct)) {
    return "Open interest history still loading";
  }
  const flatPrice = Math.abs(pricePct) < 0.04;
  const flatOi = Math.abs(oiPct) < 0.15;
  if (flatPrice && flatOi) return "Price and open interest are flat";
  const priceUp = pricePct >= 0;
  const oiUp = oiPct >= 0;
  if (priceUp && oiUp) return "Price up, open interest up — positions building";
  if (priceUp && !oiUp) return "Price up, open interest down — positions closing";
  if (!priceUp && oiUp) return "Price down, open interest up — positions building";
  return "Price down, open interest down — positions closing";
}

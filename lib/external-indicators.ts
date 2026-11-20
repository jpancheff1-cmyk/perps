import type { IndicatorSummary, Timeframe } from "./types";

/**
 * Pluggable external indicator source.
 * TradingView is declared and disabled. Nothing is fetched.
 * A later implementation can set `enabled` and fill `fetch`.
 * Returned fields overwrite the matching server-side indicator when enabled.
 */
export type ExternalIndicatorPatch = Partial<
  Pick<IndicatorSummary, "ema9" | "ema15" | "ema21" | "rsi14" | "macdLine" | "macdSignal" | "macdHist">
>;

export interface ExternalIndicatorSource {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  fetch(query: { symbol: string; timeframe: Timeframe }): Promise<ExternalIndicatorPatch | null>;
}

export const tradingViewSource: ExternalIndicatorSource = {
  id: "tradingview",
  label: "TradingView",
  enabled: false,
  async fetch() {
    return null;
  },
};

export async function mergeExternalIndicators(
  symbol: string,
  timeframe: Timeframe,
  summary: IndicatorSummary,
  source: ExternalIndicatorSource = tradingViewSource,
): Promise<IndicatorSummary> {
  if (!source.enabled) return summary;
  try {
    const extra = await source.fetch({ symbol, timeframe });
    if (!extra) return summary;
    const next = { ...summary };
    for (const key of ["ema9", "ema15", "ema21", "rsi14", "macdLine", "macdSignal", "macdHist"] as const) {
      const value = extra[key];
      if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    }
    return next;
  } catch {
    return summary;
  }
}

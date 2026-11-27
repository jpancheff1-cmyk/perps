export const HAIRCUT_MIN = 0.5;

export type MarginAccount = {
  portfolioValue: number | null;
  availableMargin: number | null;
  initialMargin: number | null;
  positions: { size: number | null }[];
  orders: { size: number | null }[];
};

/** Initial margin from the flex account. Empty books are $0, even if portfolio and available differ. */
export function marginBreakdown(account: MarginAccount) {
  const open =
    account.positions.some((position) => position.size != null && position.size !== 0) ||
    account.orders.some((order) => order.size != null && order.size !== 0);
  const marginUsed = open ? Math.max(0, account.initialMargin ?? 0) : 0;
  const portfolio = account.portfolioValue ?? 0;
  const available = account.availableMargin ?? 0;
  const haircut = Math.max(0, portfolio - available - marginUsed);
  return { marginUsed, haircut, showHaircut: haircut > HAIRCUT_MIN };
}

export function positionInitialMargin(size: number, price: number, leverage: number) {
  if (!(leverage > 0) || !(price > 0)) return 0;
  return (Math.abs(size) * price) / leverage;
}

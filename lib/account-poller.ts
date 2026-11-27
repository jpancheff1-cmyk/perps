import { buildCharts } from "./candles";
import { recordEquity } from "./equity-store";
import { fetchKrakenAccount, notConnectedAccount } from "./kraken";
import { fetchKrakenEarn, fetchKrakenOpenOrders, fetchKrakenSpot } from "./kraken-spot";
import { ACCOUNT_POLL_MS } from "./poll";
import type { AccountPayload, EarnPayload, PositionChart, SpotOrdersPayload, SpotPayload } from "./types";

export type DeskSnapshot = {
  account: AccountPayload;
  spot: SpotPayload;
  earn: EarnPayload;
  spotOrders: SpotOrdersPayload;
  charts: PositionChart[];
};

type PollState = {
  timer: ReturnType<typeof setInterval> | null;
  cache: DeskSnapshot;
  ready: boolean;
  inflight: Promise<DeskSnapshot> | null;
};

const emptySpot = (): SpotPayload => ({ connected: false, reason: "not_configured", message: "Connect spot key", assets: [], totalUsd: null, updatedAt: null });
const emptyEarn = (): EarnPayload => ({ connected: false, reason: "not_configured", message: "Connect spot key", totalUsd: null, rewardedUsd: null, updatedAt: null });
const emptyOrders = (): SpotOrdersPayload => ({ connected: false, reason: "not_configured", message: "Connect spot key", orders: [] });

const globalStore = globalThis as unknown as { __deskAccountPoll?: PollState };

function state(): PollState {
  if (!globalStore.__deskAccountPoll) {
    globalStore.__deskAccountPoll = {
      timer: null,
      cache: { account: notConnectedAccount(), spot: emptySpot(), earn: emptyEarn(), spotOrders: emptyOrders(), charts: [] },
      ready: false,
      inflight: null,
    };
  }
  return globalStore.__deskAccountPoll;
}

function merge(prev: DeskSnapshot, next: DeskSnapshot): DeskSnapshot {
  const keepAccount = !next.account.connected && next.account.reason !== "not_configured" && prev.account.connected;
  const account = keepAccount
    ? { ...prev.account, message: next.account.message ?? "The last Kraken read failed. Showing the previous account." }
    : next.account;
  const spot =
    !next.spot.connected && next.spot.reason !== "not_configured" && prev.spot.connected
      ? { ...prev.spot, message: next.spot.message }
      : next.spot;
  const earn =
    !next.earn.connected && next.earn.reason !== "not_configured" && prev.earn.connected
      ? { ...prev.earn, message: next.earn.message }
      : next.earn;
  const spotOrders =
    !next.spotOrders.connected && next.spotOrders.reason !== "not_configured" && prev.spotOrders.connected && !/permission denied|query open orders/i.test(next.spotOrders.message ?? "")
      ? prev.spotOrders
      : next.spotOrders;
  return {
    account,
    spot,
    earn,
    spotOrders,
    charts: keepAccount ? prev.charts : account.positions.length ? next.charts : [],
  };
}

async function refreshSnapshot(): Promise<DeskSnapshot> {
  const poll = state();
  if (poll.inflight) return poll.inflight;
  poll.inflight = (async () => {
    const [account, spot, earn, spotOrders] = await Promise.all([
      fetchKrakenAccount(),
      fetchKrakenSpot(),
      fetchKrakenEarn(),
      fetchKrakenOpenOrders(),
    ]);
    const charts = account.connected && account.positions.length > 0 ? await buildCharts(account.positions) : [];
    poll.cache = merge(poll.cache, { account, spot, earn, spotOrders, charts });
    const equity = poll.cache.account.portfolioValue;
    if (poll.cache.account.connected && equity != null) recordEquity(equity, poll.cache.account.updatedAt ?? Date.now());
    poll.ready = true;
    return poll.cache;
  })().finally(() => {
    poll.inflight = null;
  });
  return poll.inflight;
}

export function startAccountPoller() {
  const poll = state();
  if (poll.timer) return;
  void refreshSnapshot();
  const timer = setInterval(() => {
    void refreshSnapshot();
  }, ACCOUNT_POLL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  poll.timer = timer;
}

export async function getSnapshot(): Promise<DeskSnapshot> {
  startAccountPoller();
  const poll = state();
  if (!poll.ready) return refreshSnapshot();
  return poll.cache;
}

export async function getAccount(): Promise<AccountPayload> {
  return (await getSnapshot()).account;
}

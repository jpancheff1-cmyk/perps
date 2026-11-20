import { fetchKrakenAccount, notConnectedAccount } from "./kraken";
import { ACCOUNT_POLL_MS } from "./poll";
import type { AccountPayload } from "./types";

type PollState = {
  timer: ReturnType<typeof setInterval> | null;
  cache: AccountPayload;
  ready: boolean;
  inflight: Promise<AccountPayload> | null;
};

const globalStore = globalThis as unknown as { __deskAccountPoll?: PollState };

function state(): PollState {
  if (!globalStore.__deskAccountPoll) {
    globalStore.__deskAccountPoll = {
      timer: null,
      cache: notConnectedAccount(),
      ready: false,
      inflight: null,
    };
  }
  return globalStore.__deskAccountPoll;
}

async function refreshAccount(): Promise<AccountPayload> {
  const poll = state();
  if (poll.inflight) return poll.inflight;
  poll.inflight = fetchKrakenAccount()
    .then((account) => {
      if (!account.connected && account.reason !== "not_configured" && poll.cache.connected) {
        poll.cache = {
          ...poll.cache,
          message: account.message ?? "The last Kraken read failed. Showing the previous account.",
        };
      } else {
        poll.cache = account;
      }
      poll.ready = true;
      return poll.cache;
    })
    .finally(() => {
      poll.inflight = null;
    });
  return poll.inflight;
}

export function startAccountPoller() {
  const poll = state();
  if (poll.timer) return;
  void refreshAccount();
  const timer = setInterval(() => {
    void refreshAccount();
  }, ACCOUNT_POLL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  poll.timer = timer;
}

export async function getAccount(): Promise<AccountPayload> {
  startAccountPoller();
  const poll = state();
  if (!poll.ready) return refreshAccount();
  return poll.cache;
}

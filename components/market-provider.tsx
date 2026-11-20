"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountPayload, ActivityState, MarketPayload } from "@/lib/types";

type MarketContextValue = {
  market: MarketPayload | null;
  account: AccountPayload | null;
  activity: ActivityState | null;
  stream: "connecting" | "live" | "reconnecting";
};

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarket] = useState<MarketPayload | null>(null);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });
  const [stream, setStream] = useState<MarketContextValue["stream"]>("connecting");

  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      if (response.status === 401) {
        routerRef.current.replace("/login");
        return;
      }
      if (!response.ok || stopped) return;
      const body = (await response.json()) as {
        market: MarketPayload;
        account: AccountPayload;
        activity: ActivityState;
      };
      setMarket(body.market);
      setAccount(body.account);
      setActivity(body.activity);
    };
    void pull();

    const source = new EventSource("/api/stream");
    source.addEventListener("market", (event) => {
      setMarket(JSON.parse((event as MessageEvent).data) as MarketPayload);
      setStream("live");
    });
    source.addEventListener("account", (event) => {
      setAccount(JSON.parse((event as MessageEvent).data) as AccountPayload);
    });
    source.addEventListener("activity", (event) => {
      setActivity(JSON.parse((event as MessageEvent).data) as ActivityState);
    });
    source.onerror = () => {
      setStream("reconnecting");
      void fetch("/api/snapshot", { cache: "no-store" }).then((response) => {
        if (response.status === 401) routerRef.current.replace("/login");
      });
    };
    return () => {
      stopped = true;
      source.close();
    };
  }, []);

  return <MarketContext.Provider value={{ market, account, activity, stream }}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const value = useContext(MarketContext);
  if (!value) throw new Error("Market data is only available inside the desk.");
  return value;
}

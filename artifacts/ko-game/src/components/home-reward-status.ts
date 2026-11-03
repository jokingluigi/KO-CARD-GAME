import { useEffect, useState } from "react";
import { fetchDailyQuests, fetchAttendance } from "@/lib/rewards-client";
import { claimableHomeRewards } from "./home-lobby-policy";
/** Read in the background; never hold up authentication or home navigation. */
export function useHomeRewardStatus(accountId?: string) {
  const [value, setValue] = useState<{
    account: string;
    counts: NonNullable<ReturnType<typeof claimableHomeRewards>>;
  } | null>(null);
  useEffect(() => {
    if (!accountId) return;
    let active = true,
      last = 0,
      controller: AbortController | undefined;
    const refresh = async () => {
      if (document.hidden || Date.now() - last < 30000) return;
      last = Date.now();
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const timeout = setTimeout(() => current.abort(), 5000);
      try {
        const [q, a] = await Promise.all([
          fetchDailyQuests({ signal: current.signal }),
          fetchAttendance({ signal: current.signal }),
        ]);
        if (active && controller===current && !current.signal.aborted) {
          const counts = claimableHomeRewards(q, a);
          setValue(counts ? { account: accountId, counts } : null);
        }
      } catch {
        if (active && controller===current) setValue(null);
        current.abort();
      } finally {
        clearTimeout(timeout);
      }
    };
    void refresh();
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    const collected=(event:Event)=>{if((event as CustomEvent).detail?.accountId===accountId){last=0;void refresh();}};
    window.addEventListener('ko-rewards-updated',collected);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener('ko-rewards-updated',collected);
      controller?.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accountId]);
  return value && value.account === accountId ? value.counts : null;
}

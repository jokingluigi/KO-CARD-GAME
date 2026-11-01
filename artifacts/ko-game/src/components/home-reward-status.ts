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
        if (active && !current.signal.aborted) {
          const counts = claimableHomeRewards(q, a);
          setValue(counts ? { account: accountId, counts } : null);
        }
      } catch {
        if (active) setValue(null);
        current.abort();
      } finally {
        clearTimeout(timeout);
      }
    };
    void refresh();
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accountId]);
  return value && value.account === accountId ? value.counts : null;
}

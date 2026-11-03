import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchPacks } from "@/lib/collection-client";
export function HomePacksShortcut({ accountId }: { accountId?: string }) {
  const [, navigate] = useLocation(),
    [stock, setStock] = useState<{ account: string; count: number } | null>(
      null,
    );
  useEffect(() => {
    if (!accountId) return;
    let active = true,
      last = 0,
      request: AbortController | undefined;
    const load = async () => {
      if (document.hidden || Date.now() - last < 30000) return;
      last = Date.now();
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const result = await fetchPacks({ signal: controller.signal });
        if (!Array.isArray(result.packs)) throw Error("invalid inventory");
        const seen = new Set<string>();
        let count = 0;
        for (const pack of result.packs) {
          if (!Number.isInteger(pack.quantity) || pack.quantity < 0)
            throw Error("invalid inventory");
          if (!seen.has(pack.id)) {
            seen.add(pack.id);
            count += pack.quantity;
          }
        }
        if (active && request===controller) setStock({ account: accountId, count });
      } catch {
        if (active && request===controller) setStock(null);
      } finally {
        clearTimeout(timer);
      }
    };
    void load();
    const visible = () => {
      if (!document.hidden) void load();
    };
    const collected=(event:Event)=>{if((event as CustomEvent).detail?.accountId===accountId){last=0;void load();}};
    window.addEventListener('ko-rewards-updated',collected);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener('ko-rewards-updated',collected);
      request?.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accountId]);
  if (!stock || stock.account !== accountId || !stock.count) return null;
  return (
    <aside className="ko-home-pack-stock" aria-label="보유 팩">
      <span>
        내 팩 <strong>{stock.count}개</strong>
      </span>
      <button type="button" onClick={() => navigate("/packs")}>
        개봉 화면 열기 ▸
      </button>
    </aside>
  );
}

import { LoaderCircle, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ModeCard, OnlineAuthGate, OnlineShell } from "@/components/online-lobby-ui";
import { ONLINE_MODE_SELECT_BACK_ROUTE, ROUTES } from "@/lib/routes";

export default function Online() {
  const [, navigate] = useLocation();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [checkingActiveMatch, setCheckingActiveMatch] = useState(true);
  useEffect(() => {
    const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
    void fetch(`${apiBase}/api/online-matches/active`, { credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<{ match: { id: string } | null }> : { match: null })
      .then((result) => setActiveMatchId(result.match?.id ?? null))
      .catch(() => setActiveMatchId(null))
      .finally(() => setCheckingActiveMatch(false));
  }, []);
  return (
    <OnlineAuthGate>
      {() => <OnlineShell
        eyebrow="ONLINE BATTLE"
        title="실제 상대와 겨루는 링"
        description="빠르게 상대를 찾거나, 친구와 방 코드를 공유하세요. 전투의 모든 판정은 서버가 담당합니다."
        backHref={ONLINE_MODE_SELECT_BACK_ROUTE}
      >
        {checkingActiveMatch ? (
          <div className="mb-5 flex items-center gap-2 text-xs font-bold text-neutral-500"><LoaderCircle className="h-4 w-4 animate-spin" />진행 중인 대전을 확인하는 중입니다.</div>
        ) : activeMatchId ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-400/[0.06] p-4">
            <div>
              <p className="text-sm font-black text-amber-200">진행 중인 대전이 있습니다.</p>
              <p className="mt-1 text-xs font-bold text-neutral-500">새로고침 후에도 같은 매치로 복귀할 수 있습니다.</p>
            </div>
            <button type="button" data-testid="button-online-resume" onClick={() => navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(activeMatchId)}`)} className="rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black">대전으로 복귀</button>
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <ModeCard
            title="빠른 대전"
            description="유효한 덱을 고르고 FIFO 대기열에서 가장 오래 기다린 상대와 만납니다."
            icon="quick"
            testId="button-online-quick"
            onClick={() => navigate(ROUTES.ONLINE_QUICK)}
          />
          <ModeCard
            title="친선전"
            description="방을 만들고 코드를 공유하거나, 친구가 보낸 코드를 입력해 둘만의 대전을 준비합니다."
            icon="friendly"
            testId="button-online-friendly"
            onClick={() => navigate(ROUTES.ONLINE_FRIENDLY)}
          />
        </div>
        <div className="mt-8 flex items-center gap-3 text-xs font-bold text-neutral-500" data-testid="text-online-safety-note">
          <Shield className="h-4 w-4 text-amber-500" aria-hidden="true" />
          덱 유효성은 입장 직전에 서버에서 다시 확인합니다.
        </div>
      </OnlineShell>}
    </OnlineAuthGate>
  );
}
import { LaunchDeckBanner } from "@/components/launch-deck-banner";
import "@/components/battle-hub.css";
import { LoaderCircle, Shield } from "lucide-react";
import { SitePresenceLight } from "@/components/site-presence";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ModeCard,
  OnlineAuthGate,
  OnlineShell,
} from "@/components/online-lobby-ui";
import { ONLINE_MODE_SELECT_BACK_ROUTE, ROUTES } from "@/lib/routes";

export default function Online() {
  const [draft, setDraft] = useState<
    "loading" | "enabled" | "disabled" | "error"
  >("loading");
  const [retryDraft, setRetryDraft] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    setDraft("loading");
    void fetch(
      `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/draft/availability`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        const value = await r.json();
        if (!controller.signal.aborted)
          setDraft(value.enabled === true ? "enabled" : "disabled");
      })
      .catch(() => {
        if (active) setDraft("error");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [retryDraft]);
  const [, navigate] = useLocation();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [checkingActiveMatch, setCheckingActiveMatch] = useState(true);
  const [activeMatchError, setActiveMatchError] = useState<string | null>(null);
  const activeRequestGeneration = useRef(0);
  const checkActiveMatch = useCallback(async () => {
    const generation = ++activeRequestGeneration.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    setCheckingActiveMatch(true);
    setActiveMatchError(null);
    try {
      const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${apiBase}/api/online-matches/active`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          "진행 중인 매치 상태를 확인할 수 없습니다. 다시 시도해 주세요.",
        );
      }
      const result = (await response.json()) as {
        match?: { id?: unknown } | null;
      };
      if (result.match !== null && typeof result.match?.id !== "string") {
        throw new Error(
          "매치 상태 응답을 확인할 수 없습니다. 다시 시도해 주세요.",
        );
      }
      if (generation === activeRequestGeneration.current) {
        setActiveMatchId(
          typeof result.match?.id === "string" ? result.match.id : null,
        );
      }
    } catch {
      if (generation === activeRequestGeneration.current) {
        setActiveMatchError(
          "진행 중인 매치 상태를 확인할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.",
        );
      }
    } finally {
      window.clearTimeout(timeout);
      if (generation === activeRequestGeneration.current)
        setCheckingActiveMatch(false);
    }
  }, []);
  useEffect(() => {
    void checkActiveMatch();
    return () => {
      activeRequestGeneration.current += 1;
    };
  }, [checkActiveMatch]);
  return (
    <OnlineAuthGate>
      {(user) => (
        <div className="ko-mode-hub">
          <OnlineShell
            eyebrow="BATTLE MODES"
            brand="BATTLE"
            title="대전 모드"
            description="출전 덱으로 바로 대전하거나, 친구와 겨루고 새로운 덱을 구성하세요."
            backHref={ONLINE_MODE_SELECT_BACK_ROUTE}
          >
            <div className="ko-mode-deck">
              <LaunchDeckBanner accountId={user.id} />
            </div>
            {checkingActiveMatch ? (
              <div className="mb-5 flex items-center gap-2 text-xs font-bold text-neutral-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                진행 중인 대전을 확인하는 중입니다.
              </div>
            ) : activeMatchId ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-400/[0.06] p-4">
                <div>
                  <p className="text-sm font-black text-amber-200">
                    진행 중인 대전이 있습니다.
                  </p>
                  <p className="mt-1 text-xs font-bold text-neutral-500">
                    새로고침 후에도 같은 매치로 복귀할 수 있습니다.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="button-online-resume"
                  onClick={() =>
                    navigate(
                      `${ROUTES.ONLINE_MATCH}/${encodeURIComponent(activeMatchId)}`,
                    )
                  }
                  className="rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black"
                >
                  대전으로 복귀
                </button>
              </div>
            ) : null}
            {activeMatchError && (
              <div
                className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-400/[0.04] p-4"
                data-testid="status-online-active-match-error"
              >
                <p className="text-sm text-amber-100">{activeMatchError}</p>
                <button
                  type="button"
                  data-testid="button-online-active-match-retry"
                  onClick={() => void checkActiveMatch()}
                  className="rounded border border-amber-500/40 px-4 py-2 text-xs font-black text-amber-200 hover:bg-amber-400/10"
                >
                  다시 확인
                </button>
              </div>
            )}
            <div className="ko-battle-mode-grid">
              <ModeCard
                title="빠른 대전"
                titleStatus={<SitePresenceLight />}
                description="현재 출전 덱으로 상대를 찾습니다."
                icon="quick"
                testId="button-online-quick"
                onClick={() => navigate(ROUTES.ONLINE_QUICK)}
              />
              <ModeCard
                title="친선전"
                description="방 코드로 친구와 대전합니다."
                icon="friendly"
                testId="button-online-friendly"
                onClick={() => navigate(ROUTES.ONLINE_FRIENDLY)}
              />
              <ModeCard
                title="AI 대전"
                description="현재 출전 덱으로 AI와 바로 대전합니다."
                icon="ai"
                testId="button-mode-ai"
                actionLabel="AI 대전 시작 →"
                onClick={() => navigate(ROUTES.AI_MATCH)}
              />
              <ModeCard
                title="드래프트"
                description={
                  draft === "enabled"
                    ? "카드를 선택해 새로운 덱을 구성합니다."
                    : draft === "loading"
                      ? "이용 상태 확인 중…"
                      : draft === "error"
                        ? "이용 상태를 확인하지 못했어요."
                        : "현재 이용할 수 없어요."
                }
                icon="draft"
                testId="button-mode-draft"
                actionLabel={
                  draft === "enabled" ? "드래프트 입장 →" : "이용 상태 확인"
                }
                disabled={draft !== "enabled"}
                onClick={() => navigate("/draft")}
              />
            </div>
            {draft === "error" && (
              <button
                type="button"
                className="min-h-11 border border-amber-700 px-3"
                onClick={() => setRetryDraft((x) => x + 1)}
              >
                드래프트 상태 다시 확인
              </button>
            )}
            <div
              className="mt-8 flex items-center gap-3 text-xs font-bold text-neutral-500"
              data-testid="text-online-safety-note"
            >
              <Shield className="h-4 w-4 text-amber-500" aria-hidden="true" />덱
              준비가 필요하다면 상단의 덱 편집에서 구성할 수 있어요.
            </div>
          </OnlineShell>
        </div>
      )}
    </OnlineAuthGate>
  );
}

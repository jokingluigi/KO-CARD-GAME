import "@/components/play-hub.css";
import { ArrowLeft, Bot, Layers, LoaderCircle, Shield, Swords, Users } from "lucide-react";
import { CardArtwork } from "@/components/card-artwork";
import { fetchDecks, type Deck } from "@/lib/decks-client";
import { SitePresenceLight } from "@/components/site-presence";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { OnlineAuthGate } from "@/components/online-lobby-ui";
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
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  useEffect(() => { let alive = true; fetchDecks().then(list => { if (alive) setDeck(list.find(d => d.isSelected) ?? null); }).catch(() => { if (alive) setDeck(null); }); return () => { alive = false; }; }, []);
  const champ = deck?.champion;
  const ready = Boolean(deck?.isValid);
  return (
    <OnlineAuthGate>
      {() => (
        <main className="lux ko-mode-hub kplay">
          <div className="lux-wrap">
            <header className="lux-head">
              <button type="button" className="lux-back" onClick={() => navigate(ONLINE_MODE_SELECT_BACK_ROUTE)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />메인</button>
              <h1 className="lux-title">대전</h1>
            </header>
            {activeMatchId && !checkingActiveMatch && (
              <div className="kplay-resume" role="status">
                <span><b>진행 중인 대전이 있어요.</b><small>나갔다 와도 같은 대전으로 돌아갈 수 있어요.</small></span>
                <button type="button" className="lux-gold" data-testid="button-online-resume" onClick={() => navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(activeMatchId)}`)}>대전으로 복귀</button>
              </div>
            )}
            {activeMatchError && (
              <div className="kplay-resume kplay-resume--warn" data-testid="status-online-active-match-error">
                <span><small>{activeMatchError}</small></span>
                <button type="button" className="lux-ghost" data-testid="button-online-active-match-retry" onClick={() => void checkActiveMatch()}>다시 확인</button>
              </div>
            )}
            <div className="kplay-stage">
              <section className="kplay-deck" aria-label="출전 덱">
                <p className="kplay-label">출전 덱</p>
                <button type="button" className="kplay-deckcase" data-ready={ready || undefined} onClick={() => navigate(ROUTES.DECKS)}>
                  <span className="kplay-deckcase__art">{champ?.imageUrl ? <CardArtwork src={champ.imageUrl} alt="" className="h-full w-full" imageDisplayMode={champ.imageDisplayMode} imageScale={champ.imageScale} imagePositionX={champ.imagePositionX} imagePositionY={champ.imagePositionY} /> : <Shield className="h-12 w-12" aria-hidden="true" />}</span>
                  <span className="kplay-deckcase__plate">
                    {deck === undefined ? <small>덱 확인 중…</small> : deck ? <><b>{deck.name}</b><small>{champ?.name ?? "챔피언 없음"} · {deck.cardDefinitionIds.length}/25{ready ? "" : " · 수정 필요"}</small></> : <><b>출전 덱이 없어요</b><small>덱 편집에서 골라 주세요</small></>}
                  </span>
                </button>
                <p className="kplay-deckname">{deck ? <><b>{deck.name}</b><small>{champ?.name ?? "챔피언 없음"} · {deck.cardDefinitionIds.length}/25{ready ? " · 준비 완료" : " · 수정 필요"}</small></> : deck === null ? <><b>출전 덱이 없어요</b><small>덱 편집에서 골라 주세요</small></> : null}</p>
                <button type="button" className="lux-ghost kplay-change" onClick={() => navigate(ROUTES.DECKS)}>덱 바꾸기 / 편집</button>
              </section>
              <section className="kplay-modes" aria-label="대전 방식">
                <button type="button" className="kplay-main" data-testid="button-online-quick" disabled={!ready} onClick={() => navigate(ROUTES.ONLINE_QUICK)}>
                  <Swords className="kplay-main__icon" aria-hidden="true" />
                  <span className="kplay-main__text"><b>빠른 대전 <SitePresenceLight /></b><small>{ready ? "다른 플레이어와 바로 붙어요" : "출전 덱을 먼저 완성해 주세요"}</small></span>
                  <span className="kplay-main__go">대전 시작</span>
                </button>
                <div className="kplay-sub">
                  <button type="button" className="kplay-tile" data-testid="button-mode-ai" onClick={() => navigate(ROUTES.AI_MATCH)}><Bot className="h-6 w-6" aria-hidden="true" /><b>AI 대전</b><small>컴퓨터와 연습해요</small></button>
                  <button type="button" className="kplay-tile" data-testid="button-online-friendly" onClick={() => navigate(ROUTES.ONLINE_FRIENDLY)}><Users className="h-6 w-6" aria-hidden="true" /><b>친선전</b><small>방 코드로 친구와</small></button>
                  <button type="button" className="kplay-tile" data-testid="button-mode-draft" disabled={draft !== "enabled"} onClick={() => navigate("/draft")}><Layers className="h-6 w-6" aria-hidden="true" /><b>드래프트</b><small>{draft === "enabled" ? "카드를 골라 새 덱으로" : draft === "loading" ? "확인 중…" : draft === "error" ? "상태 확인 실패" : "지금은 쉬는 중"}</small></button>
                </div>
                {draft === "error" && <button type="button" className="lux-ghost" onClick={() => setRetryDraft((x) => x + 1)}>드래프트 상태 다시 확인</button>}
                {checkingActiveMatch && <p className="kplay-note"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />진행 중인 대전 확인 중…</p>}
              </section>
            </div>
          </div>
        </main>
      )}
    </OnlineAuthGate>
  );
}

import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, Shield, Swords } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { OnlineAuthGate, OnlineShell } from "@/components/online-lobby-ui";
import { getOnlineLobbyClient, type LobbyOpponentSummary } from "@/lib/online-lobby-client";
import { ROUTES } from "@/lib/routes";

/**
 * Stage 2 deliberately stops at the handoff boundary. The existing
 * server-authoritative match screen owns the game engine; this page only
 * presents MATCH_FOUND/MATCH_STARTING and carries the match id forward.
 */
function MatchTransitionPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, navigate] = useLocation();
  const client = getOnlineLobbyClient();
  const [opponent, setOpponent] = useState<LobbyOpponentSummary | null>(null);
  const [message, setMessage] = useState("매치 정보를 확인하는 중입니다.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.connect();
    const unsubscribe = client.onMessage((incoming) => {
      if (incoming.type === "MATCH_FOUND" || incoming.type === "MATCH_STARTING") {
        if (incoming.matchId !== matchId) return;
        setOpponent(incoming.opponent ?? null);
        setMessage(incoming.type === "MATCH_FOUND" ? "상대를 찾았습니다." : "매치를 시작합니다.");
        client.send({ type: "SUBSCRIBE", matchId: incoming.matchId });
      }
      if ((incoming.type === "LOBBY_ERROR" || incoming.type === "ERROR") && incoming.code !== "OFFLINE") {
        setError(incoming.message);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [client, matchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!matchId) setError("매치 ID를 확인할 수 없습니다.");
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [matchId]);

  return (
    <OnlineShell
      eyebrow="MATCH HANDOFF"
      title={error ? "매치에 입장하지 못했습니다" : "상대 발견"}
      description={error ?? "서버 권한으로 준비된 매치를 기존 온라인 전투 화면에 전달하고 있습니다."}
      backHref={ROUTES.ONLINE}
      status={<span className="mt-2 text-[0.62rem] font-black text-emerald-400" data-testid="status-match-transition">SERVER CONFIRMED</span>}
    >
      <section className="ko-online-panel mx-auto max-w-2xl rounded-xl p-7 sm:p-12">
        {error ? (
          <div className="text-center">
            <p className="text-sm font-bold text-red-300" data-testid="status-match-transition-error">{error}</p>
            <button type="button" data-testid="button-match-transition-back" onClick={() => navigate(ROUTES.ONLINE)} className="ko-online-action mt-7 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300">온라인 메뉴로</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-5">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/40 bg-amber-400/[0.06] text-amber-400"><Shield className="h-7 w-7" aria-hidden="true" /></div>
                <p className="mt-3 text-xs font-black text-neutral-300" data-testid="text-match-you">YOU</p>
              </div>
              <div className="font-display text-2xl font-black text-amber-400">VS</div>
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-400"><Swords className="h-7 w-7" aria-hidden="true" /></div>
                <p className="mt-3 max-w-[8rem] truncate text-xs font-black text-neutral-300" data-testid="text-match-opponent">{opponent?.nickname ?? "OPPONENT"}</p>
              </div>
            </div>
            <div className="mt-10 text-center">
              <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-amber-400" aria-hidden="true" />
              <p className="mt-4 text-lg font-black text-white" data-testid="status-match-handoff">{message}</p>
              <p className="mt-2 font-mono text-[0.68rem] text-neutral-600" data-testid="text-match-id">{matchId}</p>
            </div>
            <div className="mt-8 border-t border-neutral-900 pt-5 text-center">
              <button type="button" data-testid="button-match-continue" onClick={() => navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(matchId ?? "")}`)} className="ko-online-action inline-flex items-center gap-2 rounded border border-neutral-700 px-4 py-2.5 text-xs font-black text-neutral-300 hover:border-amber-500 hover:text-amber-200">
                전투 화면 계속
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
    </OnlineShell>
  );
}

export default function OnlineMatchTransition() {
  return <OnlineAuthGate>{() => <MatchTransitionPage />}</OnlineAuthGate>;
}
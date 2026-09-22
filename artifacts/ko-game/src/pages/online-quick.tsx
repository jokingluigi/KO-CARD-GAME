import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Radio, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import {
  DeckPicker,
  OnlineAuthGate,
  OnlineShell,
  SelectedDeckStamp,
  useOnlineDecks,
} from "@/components/online-lobby-ui";
import { getOnlineLobbyClient, type OnlineLobbyConnectionState } from "@/lib/online-lobby-client";
import { ROUTES } from "@/lib/routes";

type QuickState = "selecting" | "searching";

const connectionCopy: Record<OnlineLobbyConnectionState, string> = {
  idle: "연결 대기",
  connecting: "서버 연결 중",
  open: "서버 연결됨",
  closed: "연결 종료",
  error: "연결 오류",
};

function QuickMatchPage() {
  const [, navigate] = useLocation();
  const { decks, error: decksError } = useOnlineDecks();
  const client = getOnlineLobbyClient();
  const [connection, setConnection] = useState<OnlineLobbyConnectionState>(client.state);
  const [quickState, setQuickState] = useState<QuickState>("selecting");
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(decksError);
  const [elapsed, setElapsed] = useState(0);
  const matchFoundRef = useRef(false);
  const joinRequestedRef = useRef(false);
  const selectedDeckIdRef = useRef<string | null>(null);
  const searchStartedAtRef = useRef<number | null>(null);

  const selectedDeck = useMemo(() => decks?.find((deck) => deck.id === selectedDeckId), [decks, selectedDeckId]);
  useEffect(() => {
    if (!selectedDeckId && decks?.some((deck) => deck.isValid)) {
      setSelectedDeckId(decks.find((deck) => deck.isValid)!.id);
    }
  }, [decks, selectedDeckId]);

  useEffect(() => {
    selectedDeckIdRef.current = selectedDeckId;
  }, [selectedDeckId]);

  useEffect(() => {
    client.connect();
    const unsubscribeConnection = client.onConnectionState((next) => {
      setConnection(next);
      if (next === "open" && joinRequestedRef.current && selectedDeckIdRef.current) {
        client.send({ type: "JOIN_QUICK_QUEUE", deckId: selectedDeckIdRef.current });
      }
    });
    const unsubscribeMessage = client.onMessage((message) => {
      if (message.type === "QUICK_QUEUE_JOINED") {
        searchStartedAtRef.current = Date.now();
        setQuickState("searching");
        setError(null);
      }
      if (message.type === "MATCH_FOUND") {
        matchFoundRef.current = true;
        joinRequestedRef.current = false;
        const opponent = message.opponent?.nickname
          ? `?opponent=${encodeURIComponent(message.opponent.nickname)}`
          : "";
        navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(message.matchId)}${opponent}`);
      }
      if (message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        joinRequestedRef.current = false;
        setError(message.message);
        if (message.code !== "OFFLINE") setQuickState("selecting");
      }
    });
    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
      if (!matchFoundRef.current && joinRequestedRef.current) client.send({ type: "LEAVE_QUICK_QUEUE" });
    };
  }, [client, navigate]);

  useEffect(() => {
    if (quickState !== "searching") {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsed(searchStartedAtRef.current ? Math.floor((Date.now() - searchStartedAtRef.current) / 1000) : 0);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quickState]);

  const startSearch = () => {
    if (!selectedDeckId || !selectedDeck?.isValid) {
       setError("온라인 대전에 사용할 수 있는 덱을 선택해 주세요.");
      return;
    }
    if (connection !== "open") {
      setError("온라인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setError(null);
    joinRequestedRef.current = true;
    client.send({ type: "JOIN_QUICK_QUEUE", deckId: selectedDeckId });
  };

  const cancelSearch = () => {
    joinRequestedRef.current = false;
    client.send({ type: "LEAVE_QUICK_QUEUE" });
    setQuickState("selecting");
    setError(null);
  };

  return (
    <OnlineShell
      eyebrow="QUICK MATCH"
      title={quickState === "searching" ? "상대를 찾는 중" : "빠르게 입장하기"}
      description={quickState === "searching"
        ? "대기열에서 가장 오래 기다린 상대와 연결합니다. 이 화면을 닫으면 검색이 취소됩니다."
        : "실제 사용할 덱을 고른 뒤 검색을 시작하세요. 클라이언트는 덱의 유효성을 최종 결정하지 않습니다."}
      status={
        <span className={`mt-2 inline-flex items-center gap-1.5 text-[0.62rem] font-black ${
          connection === "open" ? "text-emerald-400" : "text-neutral-500"
        }`} data-testid="status-online-connection">
          <span className={`h-1.5 w-1.5 rounded-full ${connection === "open" ? "bg-emerald-400" : "bg-neutral-600"}`} />
          {connectionCopy[connection]}
        </span>
      }
    >
      {decksError ? (
        <div className="rounded-lg border border-red-900/70 bg-red-950/20 p-5 text-sm text-red-200" data-testid="status-online-decks-error">
          {decksError}
        </div>
      ) : decks === null ? (
        <div className="grid gap-3 md:grid-cols-2" data-testid="status-online-decks-loading">
          {[0, 1].map((item) => <div key={item} className="h-36 animate-pulse rounded-lg bg-neutral-900" />)}
        </div>
      ) : quickState === "searching" ? (
        <section className="ko-online-panel mx-auto max-w-2xl rounded-xl p-7 text-center sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/[0.07] text-amber-400">
            <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <p className="mt-7 font-display text-xs font-black tracking-[0.25em] text-amber-400">SEARCHING LIVE QUEUE</p>
          <h2 className="mt-3 text-2xl font-black text-white" data-testid="status-quick-searching">상대를 찾는 중...</h2>
          <p className="mt-2 text-sm text-neutral-500" data-testid="text-quick-elapsed">검색 {elapsed}초</p>
          <div className="mx-auto mt-8 max-w-sm text-left">
            <SelectedDeckStamp deck={selectedDeck} />
          </div>
          {error && <p className="mt-6 text-sm font-bold text-red-300" data-testid="status-quick-error">{error}</p>}
          <button
            type="button"
            data-testid="button-quick-cancel"
            onClick={cancelSearch}
            className="ko-online-action mt-8 inline-flex items-center gap-2 rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200 hover:border-amber-500 hover:text-amber-200"
          >
            검색 취소
          </button>
        </section>
      ) : (
        <>
          <DeckPicker decks={decks} selectedDeckId={selectedDeckId} onSelect={(id) => { setSelectedDeckId(id); setError(null); }} />
          {error && (
            <div className="mt-5 flex items-center gap-2 rounded border border-red-900/70 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-200" data-testid="status-quick-error">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
          <div className="mt-8 flex flex-col items-stretch justify-between gap-4 border-t border-neutral-900 pt-6 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-neutral-500"><Radio className="mr-2 inline h-3.5 w-3.5 text-amber-500" aria-hidden="true" />현재는 순위와 MMR 없이 대기 시간 순으로 연결합니다.</p>
            <button
              type="button"
              data-testid="button-quick-search"
              disabled={!selectedDeck?.isValid || connection !== "open"}
              onClick={startSearch}
              className="ko-online-action rounded bg-amber-400 px-6 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              상대 찾기
            </button>
          </div>
        </>
      )}
    </OnlineShell>
  );
}

export default function OnlineQuick() {
  return <OnlineAuthGate>{() => <QuickMatchPage />}</OnlineAuthGate>;
}
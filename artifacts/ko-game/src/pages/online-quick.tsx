import {resolveLaunchDeck,launchDeckEditor} from "@/lib/launch-deck";
import {rememberMatchDeck} from "@/components/player-tools/shelf";
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

type QuickState = "selecting" | "joining" | "searching";

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
  const selectedDeckMeta=useRef<{id:string;name:string}|null>(null);
  const client = getOnlineLobbyClient();
  const [connection, setConnection] = useState<OnlineLobbyConnectionState>(client.state);
  const [quickState, setQuickState] = useState<QuickState>("selecting");
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(()=>new URLSearchParams(window.location.search).get("repeat"));
  const [error, setError] = useState<string | null>(decksError);
  const [elapsed, setElapsed] = useState(0);
  const [queuedDeck,setQueuedDeck]=useState<{deckId:string;deckName:string;championName:string|null}|null>(null);
  const repeat=new URLSearchParams(window.location.search).get("repeat");
  const autoQueued=useRef(false);
  useEffect(()=>{if(repeat&&decks&&!decks.some(d=>d.id===repeat&&d.isValid))setError("이전 덱을 사용할 수 없어요. 다른 덱을 선택해 주세요.");},[decks,repeat]);
  const matchFoundRef = useRef(false);
  const joinRequestedRef = useRef(false);
  const selectedDeckIdRef = useRef<string | null>(null);
  const searchStartedAtRef = useRef<number | null>(null);

  const selectedDeck = useMemo(() => decks?.find((deck) => deck.id === selectedDeckId), [decks, selectedDeckId]);
  const launch=decks?resolveLaunchDeck(decks,repeat):null;
  useEffect(()=>{if(decks&&!joinRequestedRef.current&&!autoQueued.current)setSelectedDeckId(launch?.deck?.id??null);},[decks,repeat]);

  if(!joinRequestedRef.current)selectedDeckMeta.current=decks?.find(d=>d.id===selectedDeckId)??null;
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
        if(!joinRequestedRef.current)return;
        setQueuedDeck(message.deck);selectedDeckMeta.current={id:message.deck.deckId,name:message.deck.deckName};selectedDeckIdRef.current=message.deck.deckId;
        searchStartedAtRef.current = Date.now();
        setQuickState("searching");
        setError(null);
      }
      if (message.type === "MATCH_FOUND") {
        if(selectedDeckMeta.current)void rememberMatchDeck(message.matchId,{...selectedDeckMeta.current,mode:"QUICK"});
        matchFoundRef.current = true;
        joinRequestedRef.current = false;
        const opponent = message.opponent?.nickname
          ? `?opponent=${encodeURIComponent(message.opponent.nickname)}`
          : "";
        navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(message.matchId)}${opponent}`);
      }
      if (message.type === 'QUICK_AI_MATCH_FOUND') {
        if(selectedDeckMeta.current)void rememberMatchDeck(message.matchId,{...selectedDeckMeta.current,mode:'QUICK'});
        matchFoundRef.current=true;joinRequestedRef.current=false;
        navigate(`${ROUTES.AI_MATCH}?quickMatch=${encodeURIComponent(message.matchId)}`);
      }
      if (message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        joinRequestedRef.current = false;
        setError(message.message);
        setQuickState("selecting");setQueuedDeck(null);
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
    if(joinRequestedRef.current)return;
    if (!selectedDeckId || !selectedDeck?.isValid || launch?.reason) {
       setError("덱 편집기에서 사용할 수 있는 출전 덱을 지정해 주세요.");
      return;
    }
    if (connection !== "open") {
      setError("온라인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setError(null);
    joinRequestedRef.current = true;
    setQuickState("joining");
    selectedDeckIdRef.current=selectedDeckId;
    client.send({ type: "JOIN_QUICK_QUEUE", deckId: selectedDeckId });
  };

  useEffect(()=>{if(decks&&!launch?.reason&&selectedDeck?.isValid&&connection==="open"&&!autoQueued.current){autoQueued.current=true;startSearch();}},[decks,repeat,selectedDeckId,selectedDeck,connection]);
  const cancelSearch = () => {
    joinRequestedRef.current = false;
    client.send({ type: "LEAVE_QUICK_QUEUE" });
    setQuickState("selecting");
    setQueuedDeck(null);selectedDeckIdRef.current=selectedDeckId;
    setError(null);
  };

  return (
    <OnlineShell
      eyebrow="QUICK MATCH"
      title={quickState === "searching" ? "상대를 찾는 중" : quickState === "joining" ? "대기열 입장 중" : "빠르게 입장하기"}
      description={quickState === "searching"
        ? "대기열에서 가장 오래 기다린 상대와 연결합니다. 이 화면을 닫으면 검색이 취소됩니다."
        : "출전 덱으로 자동 입장합니다. 덱 변경은 덱 편집기에서 할 수 있어요."}
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
      ) : quickState !== "selecting" ? (
        <section className="ko-online-panel ko-queue-phase mx-auto max-w-2xl rounded-xl p-7 text-center sm:p-12" data-queue-phase={quickState} aria-live="polite">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/[0.07] text-amber-400">
            <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <p className="mt-7 font-display text-xs font-black tracking-[0.25em] text-amber-400">{quickState==="joining"?"QUEUE CONNECTION":"SEARCHING LIVE QUEUE"}</p>
          <h2 className="mt-3 text-2xl font-black text-white" data-ui-motion-state={`ACTIVE:${quickState}`} data-testid="status-quick-searching">{quickState==="joining"?"대기열 입장을 확인 중이에요.":"상대를 찾는 중..."}</h2>
          <p className="mt-2 text-sm text-neutral-500" data-testid="text-quick-elapsed">검색 {elapsed}초</p>
          <div className="mx-auto mt-8 max-w-sm text-left">
            <SelectedDeckStamp deck={queuedDeck?{name:queuedDeck.deckName,champion:queuedDeck.championName?{name:queuedDeck.championName}:null,isValid:true}:selectedDeck} />
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
          <section className="space-y-3"><SelectedDeckStamp deck={selectedDeck}/>{launch?.reason&&<p role="status" className="text-amber-200">{launch.reason}</p>}<button type="button" className="min-h-11 border border-amber-700 px-4" onClick={()=>navigate(launchDeckEditor(launch?.deck?.id))}>덱 편집기에서 출전 덱 변경</button></section>
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
              disabled={Boolean(launch?.reason) || !selectedDeck?.isValid || connection !== "open"}
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

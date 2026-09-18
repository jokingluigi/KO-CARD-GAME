import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, LoaderCircle, LogOut, Shield, Swords } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { OnlineAuthGate } from "@/components/online-lobby-ui";
import { getOnlineLobbyClient, type OnlineLobbyConnectionState, type OnlineServerMessage } from "@/lib/online-lobby-client";
import { ROUTES } from "@/lib/routes";
import type { OnlineActionPayload } from "@/lib/online-match-protocol";

type VisibleCard = {
  instanceId: string;
  definitionId: string;
  cardType: "WRESTLER" | "TECHNIQUE" | string;
  currentCost: number;
  currentAttack: number;
  currentHealth: number;
  boardSlot: number | null;
};

type VisiblePlayer = {
  id: string;
  health: number;
  maxHealth: number;
  currentGold: number;
  hand: VisibleCard[] | { hidden: true; count: number };
  deck: VisibleCard[] | { hidden: true; count: number };
  board: Array<VisibleCard | null>;
  champion: { name?: string; currentHealth?: number; maxHealth?: number } | null;
};

type OnlineGameState = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
  turn: number;
  activePlayerId: string | null;
  winnerId: string | null;
  players: VisiblePlayer[];
};

function isGameState(value: unknown): value is OnlineGameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OnlineGameState>;
  return Array.isArray(candidate.players) && typeof candidate.status === "string";
}

function isCards(value: VisiblePlayer["hand"]): value is VisibleCard[] {
  return Array.isArray(value);
}

function OnlineMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, navigate] = useLocation();
  const client = getOnlineLobbyClient();
  const [connection, setConnection] = useState<OnlineLobbyConnectionState>(client.state);
  const [seat, setSeat] = useState<"PLAYER_ONE" | "PLAYER_TWO" | null>(null);
  const [state, setState] = useState<OnlineGameState | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.connect();
    const unsubscribeConnection = client.onConnectionState((next) => {
      setConnection(next);
      if (next === "open" && matchId) {
        client.send({ type: "SUBSCRIBE", matchId });
      }
    });
    const unsubscribeMessage = client.onMessage((message: OnlineServerMessage) => {
      if ("matchId" in message && message.matchId !== matchId) return;
      if (
        message.type === "MATCH_SNAPSHOT" ||
        message.type === "ACTION_ACCEPTED" ||
        message.type === "MATCH_ENDED" ||
        message.type === "RESYNC_REQUIRED"
      ) {
        if (message.type === "MATCH_SNAPSHOT") setSeat(message.seat);
        if (isGameState(message.state)) {
          setState(message.state);
          setVersion("version" in message ? message.version : null);
          setError(null);
        } else {
          setError("서버 매치 상태를 해석하지 못했습니다.");
        }
        return;
      }
      if (message.type === "ACTION_REJECTED" || message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        setError(message.message);
      }
    });
    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
      if (matchId) client.send({ type: "UNSUBSCRIBE", matchId });
    };
  }, [client, matchId]);

  const me = useMemo(
    () => state?.players.find((player) => player.id === seat) ?? state?.players[0] ?? null,
    [seat, state],
  );
  const opponent = useMemo(
    () => state?.players.find((player) => player.id !== me?.id) ?? null,
    [me?.id, state],
  );
  const isMyTurn = Boolean(me && state?.activePlayerId === me.id && state.status === "IN_PROGRESS");
  const selectedCard = me && isCards(me.hand) ? me.hand.find((card) => card.instanceId === selectedCardId) : null;

  function sendAction(action: OnlineActionPayload) {
    if (!matchId || version === null) return;
    const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    client.send({
      type: "MATCH_ACTION",
      matchId,
      requestId,
      expectedVersion: version,
      action,
    });
    setSelectedCardId(null);
    setSelectedAttackerId(null);
  }

  function playSelectedCard() {
    if (!selectedCard || !isMyTurn) return;
    if (selectedCard.cardType === "TECHNIQUE") {
      sendAction({ type: "PLAY_TECHNIQUE", cardInstanceId: selectedCard.instanceId });
      return;
    }
    const slot = me?.board.findIndex((card) => card === null);
    if (slot === undefined || slot < 0) {
      setError("비어 있는 보드 슬롯이 없습니다.");
      return;
    }
    sendAction({ type: "PLAY_WRESTLER", cardInstanceId: selectedCard.instanceId, boardSlot: slot as 0 | 1 | 2 | 3 });
  }

  return (
    <main className="min-h-[100dvh] bg-[#080808] px-4 py-5 text-white sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between border-b border-neutral-900 pb-4">
          <button type="button" data-testid="button-online-match-back" onClick={() => navigate(ROUTES.ONLINE)} className="inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-amber-200">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 온라인 메뉴
          </button>
          <div className="text-right">
            <p className="font-display text-xs font-black tracking-[0.25em] text-amber-400">KO / LIVE MATCH</p>
            <p className={`mt-1 text-[0.62rem] font-bold ${connection === "open" ? "text-emerald-400" : "text-red-300"}`} data-testid="status-online-match-connection">
              {connection === "open" ? "SERVER CONNECTED" : "CONNECTION LOST"}
            </p>
          </div>
        </header>

        {!state ? (
          <section className="flex min-h-[70dvh] items-center justify-center">
            <div className="text-center">
              {error ? <CircleAlert className="mx-auto h-8 w-8 text-red-300" aria-hidden="true" /> : <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-amber-400" aria-hidden="true" />}
              <p className="mt-5 text-lg font-black" data-testid="status-online-match-loading">{error ?? "서버 매치를 불러오는 중입니다."}</p>
              {error && <button type="button" data-testid="button-online-match-retry" onClick={() => window.location.reload()} className="mt-6 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black">다시 연결</button>}
            </div>
          </section>
        ) : (
          <section className="py-6 sm:py-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-xs font-black tracking-[0.25em] text-neutral-500">TURN {state.turn}</p>
                <h1 className="mt-2 text-2xl font-black" data-testid="text-online-match-status">
                  {state.status === "FINISHED" ? "매치 종료" : isMyTurn ? "내 턴" : "상대 턴"}
                </h1>
              </div>
              <div className="text-right text-xs font-bold text-neutral-500">
                <p data-testid="text-online-match-version">STATE v{version ?? "-"}</p>
                <p className="mt-1">{seat ?? "SEAT UNKNOWN"}</p>
              </div>
            </div>

            {error && <div className="mt-5 flex items-center gap-2 rounded border border-red-900/70 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-200" data-testid="status-online-match-error"><CircleAlert className="h-4 w-4" aria-hidden="true" />{error}</div>}

            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_auto_1fr]">
              {[opponent, me].map((player, index) => player ? (
                <section key={player.id} className={`rounded-xl border p-5 ${player.id === me?.id ? "border-amber-500/40 bg-amber-400/[0.04]" : "border-neutral-800 bg-neutral-950"}`} data-testid={`panel-online-player-${player.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xs font-black tracking-[0.2em] text-amber-400">{player.id === me?.id ? "YOU" : "OPPONENT"}</p>
                      <p className="mt-2 text-lg font-black">{player.champion?.name ?? "Champion"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-white">{player.health}<span className="text-sm text-neutral-600">/{player.maxHealth}</span></p>
                      <p className="mt-1 text-xs font-bold text-amber-300">GOLD {player.currentGold}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-2">
                    {player.board.map((card, slot) => (
                      <button
                        type="button"
                        key={`${player.id}-slot-${slot}`}
                        data-testid={`button-online-board-${player.id}-${slot}`}
                        disabled={!isMyTurn || (player.id !== me?.id && !selectedAttackerId)}
                        onClick={() => {
                          if (player.id === me?.id) {
                            if (selectedCard?.cardType === "WRESTLER") {
                              sendAction({ type: "PLAY_WRESTLER", cardInstanceId: selectedCard.instanceId, boardSlot: slot as 0 | 1 | 2 | 3 });
                            } else if (card) {
                              setSelectedAttackerId(card.instanceId);
                            }
                          } else if (selectedAttackerId && card) {
                            sendAction({
                              type: "ATTACK",
                              attackerInstanceId: selectedAttackerId,
                              target: { type: "WRESTLER", playerId: player.id, cardInstanceId: card.instanceId },
                            });
                          }
                        }}
                        className={`min-h-24 rounded border p-2 text-left disabled:cursor-default ${
                          selectedAttackerId === card?.instanceId
                            ? "border-amber-400 bg-amber-400/10"
                            : "border-neutral-800 bg-black/40"
                        }`}
                      >
                        {card ? <><p className="truncate text-[0.62rem] font-black text-white">{card.definitionId}</p><p className="mt-3 text-xs font-bold text-amber-300">{card.currentAttack}/{card.currentHealth}</p></> : <span className="text-[0.6rem] font-bold text-neutral-700">SLOT {slot + 1}</span>}
                      </button>
                    ))}
                  </div>
                  {player.id !== me?.id && selectedAttackerId && (
                    <button
                      type="button"
                      data-testid={`button-online-direct-attack-${player.id}`}
                      onClick={() => sendAction({
                        type: "ATTACK",
                        attackerInstanceId: selectedAttackerId,
                        target: { type: "PLAYER", playerId: player.id },
                      })}
                      className="mt-4 w-full rounded border border-red-900/80 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-950/30"
                    >
                      선택한 wrestler로 직접 공격
                    </button>
                  )}
                  {isCards(player.hand) ? (
                    <div className="mt-5">
                      <p className="text-[0.65rem] font-black tracking-[0.18em] text-neutral-500">{player.id === me?.id ? "YOUR HAND" : "HAND"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {player.hand.map((card) => (
                          <button type="button" key={card.instanceId} data-testid={`button-online-card-${card.instanceId}`} disabled={player.id !== me?.id || !isMyTurn} onClick={() => setSelectedCardId(card.instanceId)} className={`rounded border px-3 py-2 text-left ${selectedCardId === card.instanceId ? "border-amber-400 bg-amber-400/10" : "border-neutral-800 bg-black/40"} disabled:opacity-60`}>
                            <p className="max-w-28 truncate text-[0.62rem] font-black">{card.definitionId}</p>
                            <p className="mt-1 text-[0.62rem] font-bold text-neutral-500">{card.cardType} · {card.currentCost}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-5 text-xs font-bold text-neutral-500" data-testid={`text-online-hidden-hand-${player.id}`}>HIDDEN HAND · {player.hand.count} cards</p>
                  )}
                </section>
              ) : null)}
              <div className="hidden items-center justify-center lg:flex"><Swords className="h-8 w-8 text-amber-400/50" aria-hidden="true" /></div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-neutral-900 pt-6">
              <button type="button" data-testid="button-online-play-card" disabled={!selectedCard || !isMyTurn} onClick={playSelectedCard} className="inline-flex items-center gap-2 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500">
                <Shield className="h-4 w-4" aria-hidden="true" /> 선택 카드 사용
              </button>
              <button type="button" data-testid="button-online-end-turn" disabled={!isMyTurn} onClick={() => sendAction({ type: "END_TURN" })} className="rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-40">턴 종료</button>
              <button type="button" data-testid="button-online-surrender" disabled={state.status === "FINISHED"} onClick={() => sendAction({ type: "SURRENDER" })} className="inline-flex items-center gap-2 rounded border border-red-900/80 px-5 py-3 text-sm font-black text-red-300 hover:bg-red-950/30 disabled:opacity-40">
                <LogOut className="h-4 w-4" aria-hidden="true" /> 항복
              </button>
            </div>
            {state.status === "FINISHED" && <p className="mt-6 text-center text-xl font-black text-amber-300" data-testid="status-online-match-result">{state.winnerId === me?.id ? "승리했습니다." : state.winnerId ? "패배했습니다." : "매치가 종료되었습니다."}</p>}
          </section>
        )}
      </div>
    </main>
  );
}

export default function OnlineMatch() {
  return <OnlineAuthGate>{() => <OnlineMatchPage />}</OnlineAuthGate>;
}
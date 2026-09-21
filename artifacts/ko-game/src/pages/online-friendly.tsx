import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, DoorOpen, LockKeyhole, UserRound, X } from "lucide-react";
import { useLocation } from "wouter";
import {
  DeckPicker,
  OnlineAuthGate,
  OnlineShell,
  SelectedDeckStamp,
  useOnlineDecks,
} from "@/components/online-lobby-ui";
import {
  getOnlineLobbyClient,
  type LobbyRoomState,
  type OnlineLobbyConnectionState,
} from "@/lib/online-lobby-client";
import { ROUTES } from "@/lib/routes";

type FriendlyMode = "choose" | "create" | "join";

function RoomMember({
  label,
  nickname,
  deckName,
  championName,
  ready,
  empty,
}: {
  label: string;
  nickname?: string;
  deckName?: string;
  championName?: string | null;
  ready?: boolean;
  empty?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-5 ${empty ? "border-dashed border-neutral-800 bg-black/10" : "border-neutral-800 bg-black/25"}`} data-testid={`status-room-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between">
        <span className="font-display text-[0.65rem] font-black tracking-[0.22em] text-amber-400">{label}</span>
        {!empty && (
          <span className={`inline-flex items-center gap-1 text-[0.62rem] font-black ${ready ? "text-emerald-400" : "text-neutral-500"}`} data-testid={`status-room-ready-${label.toLowerCase()}`}>
            {ready ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {ready ? "READY" : "NOT READY"}
          </span>
        )}
      </div>
      {empty ? (
        <p className="mt-6 text-sm font-bold text-neutral-600">상대가 방 코드를 입력하면 표시됩니다.</p>
      ) : (
        <>
          <p className="mt-5 flex items-center gap-2 text-lg font-black text-white" data-testid={`text-room-nickname-${label.toLowerCase()}`}>
            <UserRound className="h-4 w-4 text-neutral-500" aria-hidden="true" />{nickname}
          </p>
          <p className="mt-2 text-xs font-bold text-neutral-400">{championName ?? "챔피언 없음"} · {deckName}</p>
        </>
      )}
    </div>
  );
}

function FriendlyMatchPage() {
  const [, navigate] = useLocation();
  const { decks, error: decksError } = useOnlineDecks();
  const client = getOnlineLobbyClient();
  const [connection, setConnection] = useState<OnlineLobbyConnectionState>(client.state);
  const [mode, setMode] = useState<FriendlyMode>("choose");
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<LobbyRoomState | null>(null);
  const [error, setError] = useState<string | null>(decksError);
  const [copied, setCopied] = useState(false);
  const roomRef = useRef<LobbyRoomState | null>(null);
  const roomExitRef = useRef(false);
  const pendingRoomActionRef = useRef(false);

  const selectedDeck = useMemo(() => decks?.find((deck) => deck.id === selectedDeckId), [decks, selectedDeckId]);
  useEffect(() => {
    if (!selectedDeckId && decks?.some((deck) => deck.isValid)) setSelectedDeckId(decks.find((deck) => deck.isValid)!.id);
  }, [decks, selectedDeckId]);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    client.connect();
    const unsubscribeConnection = client.onConnectionState(setConnection);
    const unsubscribeMessage = client.onMessage((message) => {
      if (message.type === "PRIVATE_ROOM_CREATED" || message.type === "PRIVATE_ROOM_JOINED" || message.type === "PRIVATE_ROOM_UPDATED") {
        roomExitRef.current = false;
        pendingRoomActionRef.current = false;
        roomRef.current = message.room;
        setRoom(message.room);
        setMode("choose");
        setError(null);
      }
      if (message.type === "PRIVATE_ROOM_LEFT" || message.type === "PRIVATE_ROOM_CLOSED") {
        pendingRoomActionRef.current = false;
        roomRef.current = null;
        setRoom(null);
        setMode("choose");
        if (message.message) setError(message.message);
      }
      if (message.type === "MATCH_STARTING") {
        roomExitRef.current = true;
        pendingRoomActionRef.current = false;
        navigate(`${ROUTES.ONLINE_MATCH}/${encodeURIComponent(message.matchId)}`);
      }
      if (message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        pendingRoomActionRef.current = false;
        setError(message.message);
      }
    });
    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
      const activeRoom = roomRef.current;
      if (activeRoom && !roomExitRef.current) {
        client.send(activeRoom.youAreHost
          ? { type: "CLOSE_PRIVATE_ROOM", roomId: activeRoom.roomId }
          : { type: "LEAVE_PRIVATE_ROOM", roomId: activeRoom.roomId });
      } else if (pendingRoomActionRef.current && !roomExitRef.current) {
        // There is no roomId yet. Closing the socket lets the server's
        // detach handler cancel an in-flight create/join request.
        client.close();
      }
    };
  }, [client, navigate]);

  const makeRoom = () => {
    if (!selectedDeck?.isValid || connection !== "open") {
       setError(connection !== "open" ? "온라인 서버에 연결할 수 없습니다." : "온라인 대전에 사용할 수 있는 덱을 선택해 주세요.");
      return;
    }
    setError(null);
    pendingRoomActionRef.current = client.send({ type: "CREATE_PRIVATE_ROOM", deckId: selectedDeck.id });
  };

  const joinRoom = () => {
    const normalized = roomCodeInput.trim().toUpperCase();
    if (!selectedDeck?.isValid) {
      setError("온라인 대전에 사용할 수 있는 덱을 선택해 주세요.");
      return;
    }
    if (!normalized) {
      setError("방 코드를 입력해 주세요.");
      return;
    }
    if (connection !== "open") {
      setError("온라인 서버에 연결할 수 없습니다.");
      return;
    }
    setError(null);
    pendingRoomActionRef.current = client.send({ type: "JOIN_PRIVATE_ROOM", roomCode: normalized, deckId: selectedDeck.id });
  };

  const leaveRoom = () => {
    if (!room) return;
    roomExitRef.current = true;
    pendingRoomActionRef.current = false;
    client.send(room.youAreHost ? { type: "CLOSE_PRIVATE_ROOM", roomId: room.roomId } : { type: "LEAVE_PRIVATE_ROOM", roomId: room.roomId });
    roomRef.current = null;
    setRoom(null);
    setError(null);
  };

  const setReady = (ready: boolean) => {
    if (!room) return;
    client.send({ type: "SET_ROOM_READY", roomId: room.roomId, ready });
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("방 코드를 복사하지 못했습니다. 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <OnlineShell
      eyebrow="FRIENDLY MATCH"
      title={room ? "친선전 대기실" : "친구와 한 판"}
      description={room ? "양쪽이 준비되면 서버가 하나의 온라인 매치를 생성합니다." : "방 코드를 공유하고, 두 플레이어가 모두 준비되었을 때만 매치에 입장합니다."}
      status={<span className={`mt-2 inline-flex items-center gap-1.5 text-[0.62rem] font-black ${connection === "open" ? "text-emerald-400" : "text-neutral-500"}`} data-testid="status-online-connection">{connection === "open" ? "SERVER CONNECTED" : "SERVER UNAVAILABLE"}</span>}
    >
      {decksError ? (
        <div className="rounded-lg border border-red-900/70 bg-red-950/20 p-5 text-sm text-red-200" data-testid="status-online-decks-error">{decksError}</div>
      ) : decks === null ? (
        <div className="h-48 animate-pulse rounded-lg bg-neutral-900" data-testid="status-online-decks-loading" />
      ) : room ? (
        <section className="space-y-6">
          <div className="ko-online-panel flex flex-col items-start justify-between gap-5 rounded-xl p-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-neutral-500">PRIVATE ROOM CODE</p>
              <p className="ko-online-code mt-2 text-3xl font-black text-amber-300" data-testid="text-room-code">{room.roomCode}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" data-testid="button-room-copy" onClick={copyCode} className="ko-online-action inline-flex items-center gap-2 rounded border border-amber-500/50 px-4 py-2.5 text-xs font-black text-amber-200 hover:bg-amber-400/10">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? "복사됨" : "코드 복사"}
              </button>
              <button type="button" data-testid="button-room-leave" onClick={leaveRoom} className="ko-online-action rounded border border-neutral-700 px-4 py-2.5 text-xs font-black text-neutral-300 hover:border-red-700 hover:text-red-200">
                {room.youAreHost ? "방 닫기" : "방 나가기"}
              </button>
            </div>
          </div>
          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <RoomMember label="HOST" nickname={room.host.nickname} deckName={room.host.deckName} championName={room.host.championName} ready={room.host.ready} />
            <div className="text-center font-display text-2xl font-black text-amber-400">VS</div>
            {room.guest ? <RoomMember label="GUEST" nickname={room.guest.nickname} deckName={room.guest.deckName} championName={room.guest.championName} ready={room.guest.ready} /> : <RoomMember label="GUEST" empty />}
          </div>
          <div className="flex flex-col items-center gap-3">
            <SelectedDeckStamp deck={selectedDeck} />
            {room.guest ? (
              <button
                type="button"
                data-testid="button-room-ready"
                onClick={() => setReady(room.youAreHost ? !room.host.ready : !room.guest!.ready)}
                className="ko-online-action inline-flex items-center gap-2 rounded bg-amber-400 px-7 py-3 text-sm font-black text-black hover:bg-amber-300"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {room.youAreHost ? (room.host.ready ? "준비 취소" : "준비") : (room.guest.ready ? "준비 취소" : "준비")}
              </button>
            ) : (
              <p className="text-sm font-bold text-neutral-500" data-testid="status-room-waiting">상대를 기다리는 중...</p>
            )}
            <p className="text-xs text-neutral-600">상대에게는 덱 이름과 챔피언만 표시됩니다.</p>
          </div>
          {error && <p className="text-center text-sm font-bold text-red-300" data-testid="status-friendly-error">{error}</p>}
        </section>
      ) : (
        <section className="space-y-8">
          <DeckPicker decks={decks} selectedDeckId={selectedDeckId} onSelect={(id) => { setSelectedDeckId(id); setError(null); }} />
          <div className="grid gap-4 border-t border-neutral-900 pt-8 lg:grid-cols-2">
            <button type="button" data-testid="button-room-create-mode" onClick={() => { setMode("create"); setError(null); }} className={`ko-online-action rounded-lg border p-5 text-left ${mode === "create" ? "border-amber-400 bg-amber-400/[0.07]" : "border-neutral-800 bg-black/20 hover:border-amber-500/50"}`}>
              <LockKeyhole className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <p className="mt-5 text-lg font-black text-white">방 만들기</p>
              <p className="mt-2 text-sm text-neutral-500">새 코드를 발급하고 친구를 초대합니다.</p>
            </button>
            <button type="button" data-testid="button-room-join-mode" onClick={() => { setMode("join"); setError(null); }} className={`ko-online-action rounded-lg border p-5 text-left ${mode === "join" ? "border-amber-400 bg-amber-400/[0.07]" : "border-neutral-800 bg-black/20 hover:border-amber-500/50"}`}>
              <DoorOpen className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <p className="mt-5 text-lg font-black text-white">방 코드 입력</p>
              <p className="mt-2 text-sm text-neutral-500">친구에게 받은 코드를 입력합니다.</p>
            </button>
          </div>
          {mode === "create" && (
            <div className="ko-online-panel rounded-lg p-5" data-testid="panel-room-create">
              <div className="flex items-center justify-between gap-3">
                <SelectedDeckStamp deck={selectedDeck} />
                <button type="button" data-testid="button-room-create" disabled={!selectedDeck?.isValid || connection !== "open"} onClick={makeRoom} className="ko-online-action shrink-0 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500">방 만들기</button>
              </div>
            </div>
          )}
          {mode === "join" && (
            <div className="ko-online-panel rounded-lg p-5" data-testid="panel-room-join">
              <label className="block text-xs font-black tracking-[0.18em] text-neutral-400" htmlFor="friendly-room-code">ROOM CODE</label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input id="friendly-room-code" data-testid="input-room-code" value={roomCodeInput} onChange={(event) => { setRoomCodeInput(event.target.value.toUpperCase()); setError(null); }} placeholder="KO-A7F2" maxLength={10} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-4 py-3 font-display text-lg tracking-[0.18em] text-white outline-none placeholder:text-neutral-700 focus:border-amber-400" />
                <button type="button" data-testid="button-room-join" disabled={!selectedDeck?.isValid || connection !== "open"} onClick={joinRoom} className="ko-online-action inline-flex items-center justify-center gap-2 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"><DoorOpen className="h-4 w-4" aria-hidden="true" />입장</button>
              </div>
            </div>
          )}
          {error && <div className="flex items-center justify-between gap-3 rounded border border-red-900/70 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-200" data-testid="status-friendly-error">{error}<button type="button" data-testid="button-friendly-error-dismiss" onClick={() => setError(null)} aria-label="오류 닫기"><X className="h-4 w-4" aria-hidden="true" /></button></div>}
        </section>
      )}
    </OnlineShell>
  );
}

export default function OnlineFriendly() {
  return <OnlineAuthGate>{() => <FriendlyMatchPage />}</OnlineAuthGate>;
}
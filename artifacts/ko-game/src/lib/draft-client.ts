import type {
  MatchRecap,
  DraftConfig,
  DraftSeat,
  CardDefinition,
  ChampionDefinition,
} from "@workspace/game-engine";
import type {
  OnlineLobbyClientMessage,
  OnlineLobbyConnectionState,
  OnlineLobbyListener,
  OnlineLobbyConnectionListener,
  OnlineServerMessage,
} from "./online-lobby-client";
export type DraftView = {
  id: string;
  mode: "AI" | "PVP";
  phase: "WAITING" | "DRAFT" | "BATTLE" | "FINISHED" | "ABORTED";
  version: number;
  serverTime: number;
  seat: number;
  own: DraftSeat;
  opponent: {
    name: string;
    picks: number;
    ready: boolean;
    deck?: string[];
    championId?: string;
  };
  cards: CardDefinition[];
  champions: ChampionDefinition[];
  config: DraftConfig;
  recap: MatchRecap | null;
  result: {
    won: boolean;
    winnerName: string;
    turns: number;
    highlights: string[];
  } | null;
};
export type DraftSettings = {
  enabled: boolean;
  config: DraftConfig;
  cards: CardDefinition[];
  champions: ChampionDefinition[];
  poolError: string | null;
  poolWarning?: string | null;
  currentId: string | null;
};
export async function draftRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
  const r = await fetch(`${base}/api/draft${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message ?? "드래프트 요청에 실패했습니다.");
  return data;
}
export const draftCommand = (view: DraftView, type: string, pickId?: string) =>
  draftRequest<DraftView>(`/sessions/${view.id}/commands`, "POST", {
    version: view.version,
    requestId: crypto.randomUUID(),
    type,
    pickId,
  });
export class DraftBattleClient {
  state: OnlineLobbyConnectionState = "idle";
  readonly diagnostics = { transport: "draft-http" };
  private listeners = new Set<OnlineLobbyListener>();
  private connections = new Set<OnlineLobbyConnectionListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private matchId: string | null = null;
  private busy = false;
  private actionBusy = false;
  private revision = 0;
  private generation = 0;
  private lastVersion: number | null = null;
  private statuses: string | null = null;
  onMessage(fn: OnlineLobbyListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onConnectionState(fn: OnlineLobbyConnectionListener) {
    this.connections.add(fn);
    return () => {
      this.connections.delete(fn);
    };
  }
  private emit(message: OnlineServerMessage) {
    for (const fn of this.listeners) fn(message);
  }
  private connection(state: OnlineLobbyConnectionState) {
    this.state = state;
    for (const fn of this.connections) fn(state);
  }
  connect() {
    this.connection("open");
  }
  reconnectNow() {
    this.lastVersion = null;
    this.connection("open");
    void this.poll();
  }
  close() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.matchId = null;
    this.connection("closed");
  }
  private async poll() {
    if (!this.matchId || this.busy) return;
    this.busy = true;
    const id = this.matchId,
      generation = this.generation,
      revision = this.revision;
    try {
      const result = await draftRequest<OnlineServerMessage>(
        `/sessions/${id}/battle`,
      );
      if (generation === this.generation && revision === this.revision && !this.actionBusy && result.type === "MATCH_SNAPSHOT") {
        if (this.state === "error") {
          this.lastVersion = null;
          this.connection("open");
        }
        const statuses = JSON.stringify(result.connectionStates);
        if (this.statuses !== statuses) {
          for (const playerId of ["PLAYER_ONE", "PLAYER_TWO"] as const)
            this.emit({
              type: "MATCH_CONNECTION_STATUS",
              matchId: id,
              playerId,
              status: result.connectionStates[playerId],
              reconnectDeadlineAt: null,
              serverTime: result.serverTime,
            });
          this.statuses = statuses;
        }
        if (this.lastVersion === null) {
          this.lastVersion = result.version;
          this.emit(result);
        } else if (this.lastVersion !== result.version) {
          this.lastVersion = result.version;
          this.emit({
            ...result,
            type:
              (result.state as { status?: string }).status === "FINISHED"
                ? "MATCH_ENDED"
                : "ACTION_ACCEPTED",
            requestId: "draft-server-update",
          } as OnlineServerMessage);
        }
      }
    } catch (e) {
      if (generation !== this.generation || revision !== this.revision || this.actionBusy) return;
      this.emit({
        type: "ERROR",
        code: "DRAFT_UNAVAILABLE",
        message:
          e instanceof Error ? e.message : "드래프트를 불러오지 못했습니다.",
      });
      this.connection("error");
    } finally {
      this.busy = false;
    }
  }
  send(message: OnlineLobbyClientMessage): boolean {
    if (message.type === "SUBSCRIBE" || message.type === "RESYNC") {
      if (this.matchId !== message.matchId) {
        this.generation++;
        this.matchId = message.matchId;
        this.lastVersion = null;
        this.statuses = null;
      }
      if (message.type === "RESYNC") this.lastVersion = null;
      if (!this.timer) this.timer = setInterval(() => void this.poll(), 1000);
      void this.poll();
      return true;
    }
    if (message.type === "UNSUBSCRIBE") {
      this.generation++;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.matchId = null;
      return true;
    }
    if (message.type === "MATCH_ACTION") {
      if (this.actionBusy) return false;
      this.actionBusy = true;
      this.revision++;
      void draftRequest<OnlineServerMessage>(
        `/sessions/${message.matchId}/actions`,
        "POST",
        message,
      )
        .then((r) => {
          if ("version" in r) this.lastVersion = r.version;
          this.emit(r);
          if (
            "state" in r &&
            (r.state as { status?: string }).status === "FINISHED"
          )
            this.emit({ ...r, type: "MATCH_ENDED" } as OnlineServerMessage);
        })
        .catch((e) => {
          this.emit({
            type: "ACTION_REJECTED",
            matchId: message.matchId,
            requestId: message.requestId,
            code: "DRAFT_ACTION_REJECTED",
            message:
              e instanceof Error ? e.message : "행동을 처리하지 못했습니다.",
            currentVersion: message.expectedVersion,
          });
        })
        .finally(() => {
          this.actionBusy = false;
          void this.poll();
        });
      return true;
    }
    return false;
  }
}
export async function abandonDraft(id: string) {
  const view = await draftRequest<DraftView>(`/sessions/${id}`);
  await draftCommand(view, "ABORT");
  return "ABANDONED" as const;
}

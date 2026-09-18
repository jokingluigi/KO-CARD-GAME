import type { AttackTarget } from "@workspace/game-engine";
import type { BoardSlot, GameAction } from "@workspace/game-engine";

export type OnlineActionPayload =
  | { type: "PLAY_WRESTLER"; cardInstanceId: string; boardSlot: BoardSlot }
  | { type: "PLAY_TECHNIQUE"; cardInstanceId: string }
  | { type: "USE_ACTIVE"; cardInstanceId: string }
  | { type: "USE_CHAMPION_ABILITY" }
  | { type: "ATTACK"; attackerInstanceId: string; target: AttackTarget }
  | { type: "SELECT_EFFECT_TARGET"; targetId: string }
  | { type: "END_TURN" }
  | { type: "SURRENDER" };

export type OnlineClientMessage =
  | { type: "SUBSCRIBE"; matchId: string }
  | { type: "UNSUBSCRIBE"; matchId: string }
  | {
      type: "MATCH_ACTION";
      matchId: string;
      requestId: string;
      expectedVersion: number;
      action: OnlineActionPayload;
    };

export type OnlineServerMessage =
  | {
      type: "MATCH_SNAPSHOT";
      matchId: string;
      seat: "PLAYER_ONE" | "PLAYER_TWO";
      version: number;
      state: unknown;
      events: unknown[];
    }
  | {
      type: "ACTION_ACCEPTED";
      matchId: string;
      requestId: string;
      version: number;
      state: unknown;
      events: unknown[];
    }
  | {
      type: "ACTION_REJECTED";
      matchId: string;
      requestId?: string;
      code: string;
      message: string;
      currentVersion: number;
    }
  | {
      type: "MATCH_ENDED";
      matchId: string;
      version: number;
      state: unknown;
      events: unknown[];
    }
  | {
      type: "RESYNC_REQUIRED";
      matchId: string;
      version: number;
      state: unknown;
      events: unknown[];
    }
  | { type: "ERROR"; code: string; message: string };

export type ServerGameAction = GameAction;
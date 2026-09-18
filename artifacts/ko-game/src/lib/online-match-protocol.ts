export type OnlineActionPayload =
  | { type: "PLAY_WRESTLER"; cardInstanceId: string; boardSlot: 0 | 1 | 2 | 3 }
  | { type: "PLAY_TECHNIQUE"; cardInstanceId: string }
  | { type: "USE_ACTIVE"; cardInstanceId: string }
  | { type: "USE_CHAMPION_ABILITY" }
  | {
      type: "ATTACK";
      attackerInstanceId: string;
      target:
        | { type: "WRESTLER"; playerId: string; cardInstanceId: string }
        | { type: "PLAYER"; playerId: string };
    }
  | { type: "SELECT_EFFECT_TARGET"; targetId: string }
  | { type: "END_TURN" }
  | { type: "SURRENDER" };
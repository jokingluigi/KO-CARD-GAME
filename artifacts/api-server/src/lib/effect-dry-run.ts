import {
  abilitiesFor,
  createInitialGameState,
  executeAction,
  endTurn,
  enterField,
  generateCardInstance,
  startGame,
  type CardDefinition,
  type GameState,
} from "@workspace/game-engine";
import type { EffectAiDraft } from "./admin-effect-ai";

export type EffectDryRun = {
  trigger: string;
  status: "EXECUTED" | "AWAITING_TARGET" | "NOT_SIMULATED" | "ERROR";
  eventTypes: string[];
  enemyHealthDelta: number;
  note: string;
};

/** Exercises the saved AST with the same browser/server match engine, without writing to a database. */
export function dryRunCardEffect(draft: EffectAiDraft): EffectDryRun[] {
  const triggers = [...new Set(draft.effectId === "SCRIPT_V1"
    ? draft.scripts.map((script) => script.trigger)
    : draft.effects.map((effect) => effect.trigger))];
  if (draft.sourceContext.sourceType !== "CARD") return triggers.map((trigger) => ({
    trigger, status: "NOT_SIMULATED", eventTypes: [], enemyHealthDelta: 0,
    note: "챔피언 능력은 이 카드 시나리오에서 시험할 수 없습니다.",
  }));
  const unsafeInFixture = new Set([
    "SUMMON", "SUMMON_FROM_HAND", "REVIVE", "GENERATE", "TRANSFORM_SOURCE",
    "GRANT_RANDOM_CARD_TEXT", "REGISTER_LISTENER", "REGISTER_DELAYED", "QUEUE_EFFECT",
    "REPEAT_TURN_END", "COPY_BEST_STATS",
  ]);
  if (draft.mechanicPlan.actions.some((action) => unsafeInFixture.has(action))) return triggers.map((trigger) => ({
    trigger, status: "NOT_SIMULATED", eventTypes: [], enemyHealthDelta: 0,
    note: "소환·생성·지연 효과는 실제 카드 목록과 대상을 포함한 관리자 테스트 경기에서 확인해 주세요.",
  }));

  const definition: CardDefinition = {
    id: "dry-run-source", name: "효과 시험 카드", cardType: draft.sourceContext.cardType ?? "WRESTLER",
    cost: 1, attack: 1, health: 3, rulesText: "", isToken: false, isChampionToken: false,
    keywords: draft.keywords,
    abilities: abilitiesFor(draft.effectId, draft.effectConfig),
  };
  const source = generateCardInstance(definition, { instanceId: "dry-run-card" });
  const initial = (): GameState => {
    const state = createInitialGameState();
    return { ...state, cardPool: [definition] };
  };

  return triggers.map((trigger) => {
    if (definition.cardType !== "WRESTLER" && trigger !== "GAME_START" && trigger !== "ACTIVE" && trigger !== "ENTER_FIELD") return {
      trigger, status: "NOT_SIMULATED" as const, eventTypes: [], enemyHealthDelta: 0,
      note: "이 기술 카드 발동 조건은 기본 시험 경기에서 재현되지 않습니다.",
    };
    if (!["GAME_START", "TURN_START", "TURN_END", "ENTER_FIELD", "ACTIVE"].includes(trigger)) return {
      trigger, status: "NOT_SIMULATED" as const, eventTypes: [], enemyHealthDelta: 0,
      note: "이 발동 조건은 기본 시험 경기에서 재현되지 않습니다.",
    };
    try {
      const before = initial();
      let after: GameState;
      if (definition.cardType === "TECHNIQUE" && (trigger === "ACTIVE" || trigger === "ENTER_FIELD")) {
        const started = startGame(before, () => 0.5);
        const player = started.players[0]!;
        player.hand.push(source);
        player.currentGold = Math.max(player.currentGold, source.currentCost);
        const played = executeAction(started, { type: "PLAY_TECHNIQUE", playerId: "player-1", cardInstanceId: source.instanceId });
        if (!played.success) throw new Error(played.message);
        after = played.state;
      } else if (trigger === "GAME_START") {
        before.players[0]!.deck[0] = source;
        after = startGame(before, () => 0.5);
      } else if (trigger === "TURN_START") {
        before.players[0]!.board[0] = { ...source, boardSlot: 0 };
        after = startGame(before, () => 0.5);
      } else if (trigger === "TURN_END") {
        const started = startGame(before, () => 0.5);
        started.players[0]!.board[0] = { ...source, boardSlot: 0 };
        const ended = endTurn(started, "player-1");
        if (!ended.success) throw new Error("턴 종료 시험을 진행하지 못했습니다.");
        after = ended.state;
      } else {
        after = enterField(startGame(before, () => 0.5), "player-1", source, 0);
      }
      return {
        trigger,
        status: after.targetingState?.active ? "AWAITING_TARGET" as const : "EXECUTED" as const,
        eventTypes: [...new Set(after.events.map((event) => event.type))],
        enemyHealthDelta: before.players[1]!.health - after.players[1]!.health,
        note: after.targetingState?.active
          ? "대상 선택이 필요해 자동 시험은 여기까지 실행했습니다."
          : "기본 경기 시나리오에서 발동했습니다. 카드와 대상 조건에 따라 결과가 달라질 수 있습니다.",
      };
    } catch (error) {
      return {
        trigger, status: "ERROR" as const, eventTypes: [], enemyHealthDelta: 0,
        note: `기본 경기 실행 실패: ${error instanceof Error ? error.message.slice(0, 180) : "원인을 확인하지 못했습니다."}`,
      };
    }
  });
}

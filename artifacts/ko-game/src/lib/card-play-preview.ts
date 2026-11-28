import { executeAction } from "../game/actions/engine-actions";
import { getActiveCardAbilities } from "../game/cards/granted-text";
import type { CardInstance } from "../game/cards/types";
import { wrestlerPlayCost } from "../game/engine/play-wrestler";
import type { BoardSlot } from "../game/engine/board-position";
import type { GameState } from "../game/types/game-state";

export interface CardPlayPreview {
  baseCost: number;
  extraCost: number;
  totalCost: number;
  upgraded: boolean;
  pending: boolean;
  stats?: string;
  /** 업그레이드가 안 될 때의 실제 이유. 골드를 넉넉히 준 복제 상태로 다시 시험해 판별한다. */
  failReason?: "GOLD" | "TARGET";
}

/** Only probe the selected upgrade card, not every card on every animation frame.
 * Clone first: the rules, discounts, target eligibility and payments stay authoritative.
 * Never expose simulated random victims, draws or opponent cards. */
export function cardPlayPreview(
  state: GameState,
  playerId: string,
  card: CardInstance,
  slot: BoardSlot = 0,
): CardPlayPreview | null {
  const trigger =
    card.cardType === "WRESTLER" ? ["ENTER_FIELD"] : ["ENTER_FIELD", "ACTIVE"];
  const hasUpgrade = getActiveCardAbilities(card).some(
    (ability) =>
      trigger.includes(ability.trigger) &&
      ability.effects.some(
        (effect) => effect.type === "STRUCTURED" && effect.action === "PROGRAM",
      ),
  );
  if (!hasUpgrade) return null;
  const expectedBaseCost =
    card.cardType === "WRESTLER"
      ? wrestlerPlayCost(state, playerId, card)
      : card.currentCost;
  const action =
    card.cardType === "WRESTLER"
      ? {
          type: "PLAY_WRESTLER" as const,
          playerId,
          cardInstanceId: card.instanceId,
          boardSlot: slot,
        }
      : { type: "PLAY_TECHNIQUE" as const, playerId, cardInstanceId: card.instanceId };
  const result = executeAction(structuredClone(state), action);
  if (!result.success) return null;
  const events = result.state.events.slice(state.events.length);
  const basePayments = events.filter(
    (event) =>
      event.type === "GOLD_CHANGED" &&
      event.playerId === playerId &&
      event.reason === "CARD_COST",
  );
  const baseCost = basePayments.length
    ? basePayments.reduce(
        (sum, event) => sum + Math.max(0, -(event.amount ?? 0)),
        0,
      )
    : expectedBaseCost;
  const extraCost = events
    .filter(
      (event) =>
        event.type === "GOLD_CHANGED" &&
        event.playerId === playerId &&
        event.reason === "CARD_EFFECT_COST",
    )
    .reduce((sum, event) => sum + Math.max(0, -(event.amount ?? 0)), 0);
  const upgraded = events.some(
    (event) =>
      event.type === "PROGRAM_ACTIVATED" &&
      event.cardInstanceId === card.instanceId,
  );
  let failReason: CardPlayPreview["failReason"];
  if (!upgraded && !result.state.targetingState) {
    // 복제본에서만 골드를 넉넉히 주고 다시 시험한다. 실제 상태·결제에는 영향이 없다.
    const rich = structuredClone(state);
    const richPlayer = rich.players.find((player) => player.id === playerId);
    if (richPlayer) richPlayer.currentGold += 99;
    const retry = executeAction(rich, action);
    const retryUpgraded =
      retry.success &&
      retry.state.events
        .slice(rich.events.length)
        .some((event) => event.type === "PROGRAM_ACTIVATED" && event.cardInstanceId === card.instanceId);
    failReason = retryUpgraded ? "GOLD" : "TARGET";
  }
  const played = result.state.players
    .find((player) => player.id === playerId)
    ?.board.find((unit) => unit?.instanceId === card.instanceId);
  return {
    baseCost,
    extraCost,
    totalCost: baseCost + extraCost,
    upgraded,
    pending: Boolean(result.state.targetingState),
    stats: played
      ? `${played.currentAttack}/${played.currentHealth}`
      : undefined,
    failReason,
  };
}

/** 기본 표시: 최종 비용 · 결과 · 실제 이유 한 가지만. 전체 계산은 cardPlayPreviewText(상세)로. */
export function cardPlayPreviewShortText(preview: CardPlayPreview): string {
  if (preview.pending) return `${preview.totalCost}골드 · 대상을 고르면 업그레이드 비용 결정`;
  const result = preview.upgraded
    ? "업그레이드 적용"
    : preview.failReason === "GOLD"
      ? "업그레이드 안 됨: 골드 부족"
      : "업그레이드 안 됨: 조건 미충족";
  return `${preview.totalCost}골드 · ${result}${preview.stats ? ` · 소환 시 ${preview.stats}` : ""}`;
}

export function cardPlayPreviewText(preview: CardPlayPreview): string {
  const cost = `기본 ${preview.baseCost} + 추가 ${preview.extraCost} = ${preview.totalCost}골드`;
  return preview.pending
    ? `${cost} (선택 전까지의 비용) · 대상에 따른 업그레이드 추가 지불은 선택 후 결정`
    : `${cost} · ${preview.upgraded ? "업그레이드 적용" : `업그레이드 미적용 (${preview.failReason === "GOLD" ? "남은 골드 부족" : "대상·조건 미충족"})`}${preview.stats ? ` · 소환 시 ${preview.stats}` : ""}`;
}

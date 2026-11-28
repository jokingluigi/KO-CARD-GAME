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
  const result = executeAction(
    structuredClone(state),
    card.cardType === "WRESTLER"
      ? {
          type: "PLAY_WRESTLER",
          playerId,
          cardInstanceId: card.instanceId,
          boardSlot: slot,
        }
      : { type: "PLAY_TECHNIQUE", playerId, cardInstanceId: card.instanceId },
  );
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
  };
}

export function cardPlayPreviewText(preview: CardPlayPreview): string {
  const cost = `기본 ${preview.baseCost} + 추가 ${preview.extraCost} = ${preview.totalCost}골드`;
  return preview.pending
    ? `${cost} (선택 전까지의 비용) · 대상에 따른 업그레이드 추가 지불은 선택 후 결정`
    : `${cost} · ${preview.upgraded ? "업그레이드 적용" : "업그레이드 미적용 (남은 골드·유효 대상 조건 미충족)"}${preview.stats ? ` · 소환 시 ${preview.stats}` : ""}`;
}

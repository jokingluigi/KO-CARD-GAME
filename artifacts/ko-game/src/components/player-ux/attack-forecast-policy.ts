import { getDamageModifierBonus } from "../../game/effects/effect-engine";
import {
  madokawaIncomingBonus,
  silenceDamageReduction,
} from "../../game/engine/new-card-rules";
import { isChampionProtectedByToken } from "../../game/engine/direct-champion";
import { hasAwakeningInvulnerability } from "../../game/champions/awakening";
import type { CardInstance, GameState } from "@/game";
import {
  getActiveCardAbilities,
  getActiveCardKeywords,
} from "../../game/cards/granted-text";
import { keywordDamage } from "../../game/engine/keyword-rules";
/** Public board/health only. Never run speculative actions, RNG, deck or hand effects. */
export function basicAttackForecast(
  state: GameState,
  attackerId: string,
  targetId: string,
) {
  const owner = state.players[0],
    enemy = state.players[1];
  const attacker = owner.board.find((c) => c?.instanceId === attackerId);
  if (!attacker) return null;
  const target = enemy.board.find((c) => c?.instanceId === targetId);
  const warnings: string[] = [];
  if (
    owner.board.some(
      (c) =>
        c &&
        c.instanceId !== attackerId &&
        getActiveCardAbilities(c).some(
          (a) => a.trigger === "OTHER_ALLY_ATTACK",
        ),
    )
  )
    warnings.push(
      "아군 콤보가 발동하면 공격 전 수치나 대상이 달라질 수 있어요.",
    );
  if (
    [attacker, target].some(
      (c) =>
        c &&
        getActiveCardAbilities(c).some((a) =>
          [
            "BEFORE_ATTACK",
            "BEFORE_DAMAGE",
            "BEFORE_RETIRE",
            "SELF_DAMAGED",
            "SELF_RETIRE",
          ].includes(a.trigger),
        ),
    )
  )
    warnings.push("공격·피격·리타이어 발동 효과가 있는 교환입니다.");
  if (attacker.awakening || target?.awakening)
    warnings.push("각성 연계 효과는 이 기본 피해에 포함되지 않습니다.");
  const basic = (
    recipient: CardInstance,
    amount: number,
    source: CardInstance,
    recipientOwner: string,
  ) => {
    if (state.preventedDamageTargetIds?.includes(recipient.instanceId))
      return 0;
    if (
      recipient.dodgeAvailable &&
      getActiveCardKeywords(recipient).includes("DODGE")
    )
      return 0;
    return keywordDamage(
      recipient,
      Math.max(
        0,
        amount +
          (amount > 0
            ? madokawaIncomingBonus(state, recipientOwner, recipient)
            : 0) -
          silenceDamageReduction(recipient, source),
      ),
      state.turn,
      "COMBAT",
      state,
    );
  };
  if (target) {
    const damage = basic(
        target,
        attacker.currentAttack +
          getDamageModifierBonus(state, owner.id, attacker),
        attacker,
        enemy.id,
      ),
      counter = basic(
        attacker,
        target.currentAttack + getDamageModifierBonus(state, enemy.id, target),
        target,
        owner.id,
      );
    return {
      damage,
      counter,
      targetHealth: Math.max(0, target.currentHealth - damage),
      selfHealth: Math.max(0, attacker.currentHealth - counter),
      targetFalls: damage >= target.currentHealth,
      selfFalls: counter >= attacker.currentHealth,
      champion: false,
      warnings,
      blockedReason: null as string | null,
    };
  }
  if (targetId !== enemy.id) return null;
  // Deployed champion bodies and awakening interceptions have their own combat rules.
  if (enemy.board.some((c) => c?.isDirectDeployedChampion)) return null;
  const blockedReason = isChampionProtectedByToken(state, enemy.id)
    ? "상대 챔피언 토큰이 본체를 보호하고 있어요."
    : hasAwakeningInvulnerability(state, enemy.id)
      ? "상대 챔피언은 각성 보호 중이에요."
      : null;
  const damage = blockedReason
    ? 0
    : Math.max(
        0,
        attacker.currentAttack +
          getDamageModifierBonus(state, owner.id, attacker),
      );
  return {
    damage,
    counter: 0,
    targetHealth: Math.max(0, enemy.health - damage),
    selfHealth: attacker.currentHealth,
    targetFalls: !blockedReason && damage >= enemy.health,
    selfFalls: false,
    champion: true,
    warnings,
    blockedReason,
  };
}
export const FORECAST_LIMITATION =
  "현재 공개된 공격력·피해 오라·아머·방어·회피·턴당 피해 제한을 반영한 기본 교환 예상입니다. 콤보와 발동 효과 등으로 실제 결과가 달라질 수 있어요. 승패를 확정하는 표시가 아닙니다.";

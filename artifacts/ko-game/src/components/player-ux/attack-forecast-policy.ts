import type { CardInstance, GameState } from "@/game";
import { getActiveCardKeywords } from "../../game/cards/granted-text";
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
  const basic = (recipient: CardInstance, amount: number) => {
    if (state.preventedDamageTargetIds?.includes(recipient.instanceId))
      return 0;
    if (
      recipient.dodgeAvailable &&
      getActiveCardKeywords(recipient).includes("DODGE")
    )
      return 0;
    return keywordDamage(recipient, Math.max(0, amount), state.turn);
  };
  if (target) {
    const damage = basic(target, attacker.currentAttack),
      counter = basic(attacker, target.currentAttack);
    return {
      damage,
      counter,
      targetHealth: Math.max(0, target.currentHealth - damage),
      selfHealth: Math.max(0, attacker.currentHealth - counter),
      targetFalls: damage >= target.currentHealth,
      selfFalls: counter >= attacker.currentHealth,
      champion: false,
    };
  }
  if (targetId !== enemy.id) return null;
  // Deployed champion bodies and awakening interceptions have their own combat rules.
  if (enemy.board.some((c) => c?.isDirectDeployedChampion)) return null;
  return {
    damage: Math.max(0, attacker.currentAttack),
    counter: 0,
    targetHealth: Math.max(
      0,
      enemy.health - Math.max(0, attacker.currentAttack),
    ),
    selfHealth: attacker.currentHealth,
    targetFalls: attacker.currentAttack >= enemy.health,
    selfFalls: false,
    champion: true,
  };
}
export const FORECAST_LIMITATION =
  "공개 공격력·아머·면역·회피 기준의 기본 교환 예상입니다. 콤보, 발동 효과, 오라, 각성 보호와 타워 유물 등으로 실제 결과가 달라질 수 있어요. 승패를 확정하는 표시가 아닙니다.";

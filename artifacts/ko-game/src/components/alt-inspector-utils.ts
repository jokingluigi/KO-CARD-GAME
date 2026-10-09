import { configuredCountdownTurns } from '@workspace/effect-registry';
import { getCardDefinition, type CardInstance } from '../game';
import { canonicalCardTags } from '../game/cards/tags';
import { getCardRuntimeRulesText, getVisibleCardKeywords, getVisibleCardRulesText } from '../lib/card-display-state';
import { getActiveCardKeywords } from '../game/cards/granted-text';

export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  FUSION: '빈 필드 슬롯과 다른 아군 선수가 있어야 손에서 낼 수 있습니다. 등장 후 아군에게 현재 공격력·체력을 더하고 양쪽 합체 효과를 처리한 뒤 재료가 소멸합니다. 취소하면 카드와 골드를 복원합니다.',
  VANISH: '리타이어·파괴가 아니며 묘지에 가지 않고 현재 전투에서 완전히 제거됩니다.',
  CANNOT_ATTACK: '공격을 선언할 수 없습니다. 카드 효과와 반격은 정상 작동합니다. 침묵하면 제거됩니다.',
  WANTED: '상대방이 이 카드를 리타이어하거나 파괴하면, 상대방은 다음 자기 턴에 골드를 1 더 받습니다.',
  COUNTDOWN: '다음 자기 턴 시작부터 1씩 감소합니다. 0이 될 때 살아 있으면 한 번 발동합니다. 침묵하면 해제되며, 재등장하면 처음부터 시작합니다.',
  IMMUNE: '카드나 챔피언의 효과로 직접 지정할 수 없습니다.',
  REGEN: '양쪽 플레이어의 턴이 끝날 때마다 체력을 2 회복합니다. 기본 회복은 최대 체력을 넘지 않습니다.',
  ARMOR: '공격과 반격으로 받는 피해를 아머 수치만큼 줄입니다. 카드 효과 피해는 줄이지 않습니다. 최소 피해는 0입니다.',
  CONDITION: '설정된 사용 조건을 달성했을 때만 낼 수 있습니다.',
  DEFENSE: '등장 후 다음 자기 턴 시작까지 피해를 받지 않으며 공격 대상으로 지정할 수 없습니다.',
  LIFESTEAL: '자신의 공격으로 준 피해만큼 아군 챔피언의 체력을 회복합니다.',
  RUSH: '등장한 턴에도 선수 또는 상대 챔피언을 공격할 수 있습니다.',
  SURPRISE: '등장한 턴에도 상대 선수 카드를 공격할 수 있습니다.',
  TAUNT: '상대는 가능한 경우 이 선수를 먼저 공격해야 합니다.',
  DODGE: '처음 받는 피해 1회를 완전히 무효화합니다.',
  STUN: '기절한 동안 공격할 수 없습니다. 기절한 선수의 자기 턴 종료 시 해제됩니다.',
  MULTI_STRIKE: '한 턴에 두 번 공격할 수 있습니다.',
  SILENCE: '카드의 키워드와 능력을 비활성화합니다.',
};

export const KEYWORD_LABELS: Record<string, string> = {
  FUSION: '합체', VANISH: '소멸', CANNOT_ATTACK: '공격불가',
  WANTED: '수배',
  COUNTDOWN: '카운트다운', IMMUNE: '면역', REGEN: '치유', ARMOR: '아머', CONDITION: '조건', DEFENSE: '방어', LIFESTEAL: '흡혈',

  RUSH: '러쉬',
  SURPRISE: '기습',
  TAUNT: '도발',
  DODGE: '회피',
  STUN: '기절',
  MULTI_STRIKE: '연타',
  SILENCE: '침묵',
  DISABLED: '봉인',
};

export function calculateInspectorPosition(
  anchorRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  panelRect: Pick<DOMRect, 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const margin = 12;
  const gap = 10;
  const panelWidth = Math.min(panelRect.width, viewportWidth - margin * 2);
  const panelHeight = Math.min(panelRect.height, viewportHeight - margin * 2);
  const roomBelow = viewportHeight - anchorRect.bottom - gap;
  const roomAbove = anchorRect.top - gap;
  const preferredTop =
    roomBelow >= panelHeight || roomBelow >= roomAbove
      ? anchorRect.bottom + gap
      : anchorRect.top - panelHeight - gap;
  const preferredLeft =
    anchorRect.right + gap + panelWidth <= viewportWidth - margin
      ? anchorRect.right + gap
      : anchorRect.left - panelWidth - gap;
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);

  return {
    left: Math.min(Math.max(margin, preferredLeft), maxLeft),
    top: Math.min(Math.max(margin, preferredTop), maxTop),
  };
}

export function getCardInspectorMetadata(card: CardInstance, override?:ReturnType<typeof getCardDefinition>) {
  const definition = override ?? getCardDefinition(card.definitionId);
  const tags = [...new Set(canonicalCardTags([...(definition?.tags ?? card.tags ?? []), ...(card.grantedTags ?? [])]))];
  const visibleKeywords = getVisibleCardKeywords(
    getActiveCardKeywords(card),
    card.isSilenced,
    card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0),
  );
  const keywords = visibleKeywords
    .filter((keyword) => !['SILENCE', 'STUN', 'DISABLED'].includes(keyword))
    .map((keyword) => ({
      key: keyword,
      label: keyword === 'ARMOR' ? `아머(${card.armor ?? 0})` : keyword === 'COUNTDOWN' ? card.countdownResolved ? '카운트다운 · 발동 완료' : `카운트다운(${card.countdownRemaining ?? configuredCountdownTurns({countdownTurns:card.grantedText?.countdownTurns ?? card.countdownTurns})})` : KEYWORD_LABELS[keyword] ?? keyword,
      description: keyword === 'ARMOR' ? `공격과 반격으로 받는 피해를 ${card.armor ?? 0} 줄입니다. 카드 효과 피해는 줄이지 않습니다. 최소 피해는 0입니다.` : KEYWORD_DESCRIPTIONS[keyword] ?? '특수 키워드입니다.',
    }));
  const statuses = [
    card.isSilenced ? { key: 'SILENCE', label: '침묵', description: KEYWORD_DESCRIPTIONS.SILENCE } : null,
    card.isStunned ? { key: 'STUN', label: '기절', description: KEYWORD_DESCRIPTIONS.STUN } : null,
    card.isAbilityDisabled ? { key: 'DISABLED', label: '봉인', description: '카드의 능력을 사용할 수 없습니다.' } : null,
  ].filter((status): status is { key: string; label: string; description: string } => Boolean(status));
  return {
    definition,
    tags,
    keywords,
    statuses,
    rulesText:
      getVisibleCardRulesText(
        getCardRuntimeRulesText(card, definition?.rulesText ?? ''),
        visibleKeywords,
      ) ||
      '효과 없음',
  };
}

export type NumericChangeStat = 'attack' | 'health' | 'maxHealth' | 'currentHealth' | 'cost';

export interface NumericChange {
  stat: NumericChangeStat;
  before: number;
  after: number;
  delta: number;
  sourceDefinitionId?: string;
  sourceName?: string;
  sourceEffectId?: string;
  turnNumber?: number;
  duration?: 'THIS_TURN' | 'UNTIL_NEXT_TURN' | 'PERMANENT';
}

/**
 * Card instances from older snapshots do not have history yet. The generic
 * baseline rows still make every persisted stat change visible; newer
 * snapshots may provide statHistory entries with effect/source attribution.
 */
export function getNumericChanges(card: CardInstance): NumericChange[] {
  const definition = getCardDefinition(card.definitionId);
  const baseline = {
    attack: card.baseAttack ?? definition?.attack ?? card.currentAttack,
    health: card.baseHealth ?? definition?.health ?? card.maxHealth,
    maxHealth: card.baseHealth ?? definition?.health ?? card.maxHealth,
    cost: card.baseCost ?? definition?.cost ?? card.currentCost,
  };
  const history = (card as CardInstance & { statHistory?: NumericChange[] }).statHistory ?? [];
  const changes = history.filter((entry) => entry.before !== entry.after);
  const has = new Set(changes.map((entry) => entry.stat));
  const inferred: NumericChange[] = [];
  const add = (stat: NumericChangeStat, before: number, after: number, sourceName = '기본 수치') => {
    if (before !== after && !has.has(stat)) {
      inferred.push({
        stat,
        before,
        after,
        delta: after - before,
        sourceDefinitionId: definition?.id,
        sourceName,
      });
    }
  };
  add('cost', baseline.cost, card.currentCost);
  add('attack', baseline.attack, card.currentAttack);
  add('maxHealth', baseline.maxHealth, card.maxHealth);
  if (card.currentHealth === card.maxHealth) {
    add('health', baseline.health, card.currentHealth);
  }
  if (card.currentHealth !== card.maxHealth && !has.has('currentHealth')) {
    inferred.push({
      stat: 'currentHealth',
      before: card.maxHealth,
      after: card.currentHealth,
      delta: card.currentHealth - card.maxHealth,
      sourceName: '피해/회복',
    });
  }
  return [...changes, ...inferred].sort((left, right) => (right.turnNumber ?? -1) - (left.turnNumber ?? -1));
}

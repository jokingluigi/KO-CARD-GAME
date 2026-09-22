import { getCardDefinition, type CardInstance } from '../game';
import { canonicalCardTags } from '../game/cards/tags';
import { getVisibleCardKeywords, getVisibleCardRulesText } from '../lib/card-display-state';

export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  RUSH: '등장한 턴에도 선수 또는 상대 챔피언을 공격할 수 있습니다.',
  SURPRISE: '등장한 턴에도 상대 선수 카드를 공격할 수 있습니다.',
  TAUNT: '상대는 가능한 경우 이 선수를 먼저 공격해야 합니다.',
  DODGE: '처음 받는 피해 1회를 완전히 무효화합니다.',
  STUN: '기절한 동안 공격할 수 없습니다.',
  MULTI_STRIKE: '한 턴에 두 번 공격할 수 있습니다.',
  SILENCE: '카드의 키워드와 능력을 비활성화합니다.',
};

export const KEYWORD_LABELS: Record<string, string> = {
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

export function getCardInspectorMetadata(card: CardInstance) {
  const definition = getCardDefinition(card.definitionId);
  const tags = canonicalCardTags(definition?.tags ?? card.tags).slice(0, 3);
  const visibleKeywords = getVisibleCardKeywords(
    card.keywords,
    card.isSilenced,
    card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0),
  );
  const keywords = visibleKeywords
    .filter((keyword) => !['SILENCE', 'STUN', 'DISABLED'].includes(keyword))
    .map((keyword) => ({
      key: keyword,
      label: KEYWORD_LABELS[keyword] ?? keyword,
      description: KEYWORD_DESCRIPTIONS[keyword] ?? '특수 키워드입니다.',
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
      getVisibleCardRulesText(definition?.rulesText ?? '', visibleKeywords) ||
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
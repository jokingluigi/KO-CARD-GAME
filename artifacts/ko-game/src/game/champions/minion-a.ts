import { fallbackZombieToken } from '../engine/zombie-token';
import { ACTIONS, TRIGGERS, KEYWORDS, isEffectScript } from '@workspace/effect-registry';
import type { CardDefinition } from '../cards/types';
import type { PublishedCardRecord } from '../cards/published-cards';
import { cardRecordToDefinition } from '../cards/published-cards';
export const MINION_A_ID = 'champion-minion-a';
export const MINION_A_TEXT = '완전히 무작위 카드 1장을 내 손에 생성합니다.';
/** Status, ownership, rarity and deck eligibility deliberately do not participate. */
export function minionACatalog(records: readonly unknown[]): CardDefinition[] {
  const definitions = new Map<string, CardDefinition>();
  for (const raw of records) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as PublishedCardRecord & { deleted?: boolean; deletedAt?: unknown };
    if (r.deleted === true || r.deletedAt != null || typeof r.id !== 'string' || !r.id.trim() ||
        typeof r.name !== 'string' || !r.name.trim() || !['WRESTLER','TECHNIQUE'].includes(r.cardType) ||
        ![r.cost,r.attack,r.health].every(n => Number.isSafeInteger(n) && n >= 0) ||
        typeof r.text !== 'string' ||
        !Array.isArray(r.keywords) || !r.keywords.every(k => (KEYWORDS as readonly string[]).includes(k)) ||
        (r.tags !== undefined && (!Array.isArray(r.tags) || !r.tags.every(t => typeof t === 'string'))) ||
        typeof r.isToken !== 'boolean' || typeof r.isChampionToken !== 'boolean' ||
        !r.effectConfig || typeof r.effectConfig !== 'object' || Array.isArray(r.effectConfig)) continue;
    try {
      const definition = cardRecordToDefinition(r);
      if (r.effectId === 'STRUCTURED_EFFECTS_V1' && (!Array.isArray(r.effectConfig.effects) ||
          (r.effectConfig.effects as unknown[]).some(rawEffect => {
            if (!rawEffect || typeof rawEffect !== 'object') return true;
            const e = rawEffect as { action?: string; trigger?: string; target?: { count?: number; selection?: string } };
            return !(ACTIONS as readonly unknown[]).includes(e.action) || !(TRIGGERS as readonly unknown[]).includes(e.trigger) ||
              (e.target !== undefined && (!e.target || typeof e.target !== 'object' || !Number.isSafeInteger(e.target.count) || e.target.count! < 1));
          }))) continue;
      if (r.effectId === 'SCRIPT_V1' && (!Array.isArray(r.effectConfig.scripts) || !r.effectConfig.scripts.every(isEffectScript))) continue;
      if (r.effectId && !['STRUCTURED_EFFECTS_V1','SCRIPT_V1','ACTIVE_GAIN_GOLD','ENTER_FIELD_GAIN_GOLD','ENTER_FIELD_DAMAGE_OPPONENT_CHAMPION','LEAVE_FIELD_GAIN_GOLD','ACTIVE_MODIFY_SELF_ATTACK'].includes(r.effectId) && !definition.abilities.length) continue;
      definitions.set(definition.id, definition);
    } catch { /* Malformed records cannot become playable cards. */ }
  }
  return [...definitions.values()].sort((a,b) => a.id.localeCompare(b.id));
}
export function isMinionAAbility(state: import('../types/game-state').GameState, action: import('../actions/types').GameAction): boolean {
  return action.type === 'USE_CHAMPION_ABILITY' && state.players.some(p => p.id === action.playerId && p.champion?.id === MINION_A_ID);
}

/** DB catalog plus the actual built-in special token; QA/training dummies are excluded. */
export function completeMinionACatalog(records: readonly unknown[]): CardDefinition[] {
  return [...new Map([...minionACatalog(records), fallbackZombieToken].map(d => [d.id, d])).values()].sort((a,b) => a.id.localeCompare(b.id));
}

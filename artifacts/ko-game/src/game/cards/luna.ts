import type { PublishedCardRecord } from './published-cards';
export const LUNA_ID = '9b7c0e52-2184-4ec1-8d68-39a4d5981d2a';
export const LUNA_OLD_TEXT = '이 카드를 처음으로 공격한 적 선수는 공격 이후 침묵됩니다. 이후 이 카드의 능력을 비활성화합니다.';
export const LUNA_RULES_TEXT = '이 카드를 처음으로 공격한 적 선수는 공격 이후 침묵됩니다. 이후 이 카드도 침묵됩니다.';

export function lunaSelfSilenceRecord(card: PublishedCardRecord): PublishedCardRecord {
  if (card.id !== LUNA_ID || card.text !== LUNA_OLD_TEXT || card.effectId !== 'STRUCTURED_EFFECTS_V1'
      || !Array.isArray(card.effectConfig.effects)) return card;
  const effects = card.effectConfig.effects;
  const replaced = effects.map(raw => {
    if (!raw || typeof raw !== 'object') return raw;
    const effect = raw as Record<string, unknown>;
    const target = effect.target as Record<string, unknown> | undefined;
    return effect.trigger === 'FIRST_ATTACKED' && effect.action === 'DISABLE_ABILITY'
      && target?.owner === 'SELF' && target?.selection === 'SELF'
      ? {...effect, action:'SILENCE'} : raw;
  });
  if (replaced.every((effect, index) => effect === effects[index])) return card;
  return {...card,text:card.text === LUNA_OLD_TEXT ? LUNA_RULES_TEXT : card.text,
    effectConfig:{...card.effectConfig,effects:replaced}};
}

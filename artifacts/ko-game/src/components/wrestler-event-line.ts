import type { GameEvent } from '../game/events/types';
import type { CardDefinition, CardInstance } from '../game/cards/types';
export function wrestlerEventLine(event: GameEvent, definitions: readonly CardDefinition[], before: Map<string, CardInstance>, after: Map<string, CardInstance>) {
  if (!event.cardInstanceId || !['ENTER_FIELD', 'CARD_RETIRED', 'CARD_DESTROYED'].includes(event.type)) return null;
  const instance = event.type === 'ENTER_FIELD' ? after.get(event.cardInstanceId) ?? before.get(event.cardInstanceId) : before.get(event.cardInstanceId) ?? after.get(event.cardInstanceId);
  const definition = definitions.find(d => d.id === (event.cardDefinitionId ?? instance?.definitionId));
  if (!definition || (definition.cardType ?? 'WRESTLER') !== 'WRESTLER' || (event.type !== 'ENTER_FIELD' && event.boardSlot === undefined)) return null;
  const text = (event.type === 'ENTER_FIELD' ? definition.summonLine : event.type === 'CARD_RETIRED' ? definition.retireLine : definition.destroyLine?.trim() || definition.retireLine)?.trim();
  return text ? { text, speaker: definition.name } : null;
}

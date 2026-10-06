import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { validAwakeningQuestConfig } from '../champions/awakening-types';

function allCards(state: GameState): CardInstance[] {
  return state.players.flatMap((player) => [
    ...player.deck,
    ...player.hand,
    ...player.board.filter((card): card is CardInstance => card !== null),
    ...player.graveyard,
    ...player.removedFromGame,
  ]);
}

/**
 * Persisted online states must carry the catalog that created their instances.
 * Silently continuing with a partial catalog lets a malformed reference look
 * like a real card in a later random-generation or render path.
 */
export function validateCardDefinitionReferences(state: GameState): void {
  if (!Array.isArray(state.cardPool) || state.cardPool.length === 0) {
    throw new Error('저장된 매치에 CardDefinition catalog이 없습니다.');
  }

  const definitionIds = new Set<string>();
  for (const definition of state.cardPool) {
    if (!definition?.id || definitionIds.has(definition.id)) {
      throw new Error('저장된 매치의 CardDefinition catalog이 유효하지 않습니다.');
    }
    definitionIds.add(definition.id);
  }

  for (const definition of state.minionACardPool ?? []) {
    if (!definition?.id) throw new Error('저장된 미니언 A 전체 카드 목록이 유효하지 않습니다.');
    definitionIds.add(definition.id);
  }

  for (const card of allCards(state)) {
    if (!definitionIds.has(card.definitionId)) {
      throw new Error(`저장된 매치의 CardInstance가 알 수 없는 CardDefinition을 참조합니다: ${card.definitionId}`);
    }
    for (const captured of card.capturedCards ?? []) {
      if (!definitionIds.has(captured.definitionId)) {
        throw new Error(`저장된 매치의 captured CardInstance가 알 수 없는 CardDefinition을 참조합니다: ${captured.definitionId}`);
      }
    }
  }

  for (const player of state.players) {
    const config = player.champion?.quest?.awakening;
    if (config) {
      if (!validAwakeningQuestConfig(config)) throw new Error('저장된 각성 퀘스트 설정이 유효하지 않습니다.');
      for (const stage of ['TANK', 'HEALER', 'DEALER'] as const) {
        const definition = state.cardPool.find(card => card.id === config.stageCardIds[stage]);
        if (!definition?.questExclusive || definition.awakeningStage !== stage || definition.cardType !== 'WRESTLER' || definition.rarity !== 'CHAMPION') {
          throw new Error('저장된 각성 퀘스트에 전용 선수 정의가 없습니다.');
        }
      }
    }
    const tokenId = player.champion?.championTokenDefinitionId;
    if (tokenId && !definitionIds.has(tokenId)) {
      throw new Error(`저장된 Champion이 알 수 없는 Champion Token을 참조합니다: ${tokenId}`);
    }
  }
}

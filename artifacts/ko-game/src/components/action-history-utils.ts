import { getCardDefinition, type CardInstance, type GameEvent, type GameState } from '../game';

const VISIBLE_EVENT_TYPES = new Set<GameEvent['type']>([
  'CARD_PLAYED',
  'ENTER_FIELD',
  'CHAMPION_ABILITY_USED',
  'CARD_GENERATED',
  'CARD_TRANSFORMED',
  'CARD_DESTROYED',
  'CARD_RETIRED',
  'CARD_REMOVED',
  'ATTACK_DECLARED',
  'DAMAGE_DEALT',
  'STAT_CHANGED',
  'CARD_TEXT_GRANTED',
  'CHAMPION_QUEST_COMPLETED',
  'GOLD_CHANGED',
]);

export function findCard(state: GameState, cardInstanceId?: string): CardInstance | null {
  if (!cardInstanceId) return null;
  for (const player of state.players) {
    const cards = [
      ...player.deck,
      ...player.hand,
      ...player.board.filter((card): card is CardInstance => card !== null),
      ...player.graveyard,
      ...player.removedFromGame,
    ];
    const card = cards.find((candidate) => candidate.instanceId === cardInstanceId);
    if (card) return card;
  }
  return null;
}

export function playerLabel(state: GameState, playerId?: string, viewerPlayerId = state.players[0].id): string {
  if (!playerId) return '시스템';
  return playerId === viewerPlayerId ? '나' : '상대';
}

function cardName(state: GameState, cardInstanceId?: string): string {
  const card = findCard(state, cardInstanceId);
  return card
    ? state.cardPool?.find((definition) => definition.id === card.definitionId)?.name ?? getCardDefinition(card.definitionId)?.name ?? '알 수 없는 카드'
    : '알 수 없는 카드';
}

export function eventTitle(state: GameState, event: GameEvent, viewerPlayerId = state.players[0].id): string {
  const subject = (target: GameEvent['target']) => target?.type === 'CARD'
    ? cardName(state, target.cardInstanceId)
    : target?.type === 'PLAYER' ? `${playerLabel(state, target.playerId, viewerPlayerId)} 챔피언`
      : '대상';
  switch (event.type) {
    case 'CARD_PLAYED':
      return `${cardName(state, event.cardInstanceId)} 플레이`;
    case 'ENTER_FIELD':
      return `${cardName(state, event.cardInstanceId)} 소환`;
    case 'CARD_GENERATED':
      return `${cardName(state, event.cardInstanceId)} 생성`;
    case 'CARD_TRANSFORMED': {
      const next = state.cardPool?.find((definition) => definition.id === event.reason) ?? getCardDefinition(event.reason ?? '');
      const previousId = event.tags?.find((tag) => tag.startsWith('FROM:'))?.slice(5);
      const previous = state.cardPool?.find((definition) => definition.id === previousId) ?? getCardDefinition(previousId ?? '');
      const actor = event.source?.type === 'CARD' && event.source.cardInstanceId !== event.cardInstanceId
        ? `${cardName(state, event.source.cardInstanceId)} 효과: ` : '';
      return `${actor}${previous?.name ?? '선수'} → ${next?.name ?? '새 카드'} 변신`;
    }
    case 'CARD_DESTROYED':
      return `${event.source?.type === 'CARD' ? `${cardName(state, event.source.cardInstanceId)} → ` : ''}${cardName(state, event.cardInstanceId)} 파괴`;
    case 'CARD_RETIRED':
      return `${cardName(state, event.cardInstanceId)} 리타이어`;
    case 'CARD_REMOVED':
      return `${cardName(state, event.cardInstanceId)} 경기에서 제외`;
    case 'DAMAGE_DEALT':
      return `${event.source?.type === 'CARD' ? cardName(state, event.source.cardInstanceId) : '효과'} → ${subject(event.target)}: ${event.reason === 'DODGE' ? '회피' : `${event.amount ?? 0} 피해`}`;
    case 'STAT_CHANGED': {
      const stat = { attack: '공격력', health: '체력', currentHealth: '체력', maxHealth: '최대 체력', cost: '비용' }[event.stat ?? 'attack'];
      const source = event.source?.type === 'CARD' && event.source.cardInstanceId !== event.cardInstanceId
        ? `${cardName(state, event.source.cardInstanceId)} → ` : '';
      return `${source}${subject(event.target)} ${stat} ${event.delta && event.delta > 0 ? '+' : ''}${event.delta ?? 0}`;
    }
    case 'CARD_TEXT_GRANTED':
      return `${subject(event.target)} 카드 효과 획득`;
    case 'CHAMPION_QUEST_COMPLETED': {
      const champion = state.players.find((player) => player.id === event.playerId)?.champion;
      return `${champion?.name ?? '챔피언'} 퀘스트 완료${champion?.quest?.rewardText ? ` · ${champion.quest.rewardText}` : ''}`;
    }
    case 'GOLD_CHANGED':
      return `${event.reason === 'CHAMPION_QUEST_REWARD' ? '퀘스트 보상 ' : ''}골드 ${event.amount && event.amount > 0 ? '+' : ''}${event.amount ?? 0}`;
    case 'CHAMPION_ABILITY_USED':
      return '챔피언 고유 능력 사용';
    case 'ATTACK_DECLARED': {
      const attacker =
        event.source?.type === 'CARD'
          ? cardName(state, event.source.cardInstanceId)
          : '선수';
      const target =
        event.target?.type === 'CARD'
          ? cardName(state, event.target.cardInstanceId)
          : event.target?.type === 'PLAYER'
            ? `${playerLabel(state, event.target.playerId, viewerPlayerId)} 챔피언`
            : '대상';
      return `${attacker} → ${target}`;
    }
    default:
      return '';
  }
}

export function historyEvents(state: GameState, limit = 12): GameEvent[] {
  const playedCardIds = new Set(
    state.events
      .filter((event) => event.type === 'CARD_PLAYED')
      .map((event) => event.cardInstanceId)
      .filter((id): id is string => id !== undefined),
  );

  return state.events
    .filter((event) => VISIBLE_EVENT_TYPES.has(event.type) && (event.type !== 'GOLD_CHANGED' || event.reason === 'CHAMPION_QUEST_REWARD') && (event.type !== 'STAT_CHANGED' || (event.delta ?? 0) !== 0))
    .filter(
      (event) =>
        event.type !== 'ENTER_FIELD' ||
        !event.cardInstanceId ||
        !playedCardIds.has(event.cardInstanceId),
    )
    .slice(-limit)
    .reverse();
}

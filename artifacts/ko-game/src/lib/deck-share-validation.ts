import { DECK_SIZE, MAX_LEGENDARY_CARDS, maxCardCopies, validateDeckCounts } from '@workspace/game-engine';
import type { DeckCard, DeckChampion, DeckOptions } from './decks-client';
import { deckEntityRevision, encodeDeck, type SharedDeck } from './deck-share-code';

export function createDeckSnapshot(name: string, champion: DeckChampion | undefined, ids: string[], cards: Map<string, DeckCard>): SharedDeck {
  if (!champion || champion.status !== 'PUBLISHED') throw new Error('공개된 챔피언을 선택해야 공유할 수 있습니다.');
  const counts = new Map<string, number>();
  ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  const entries = [...counts].map(([id, count]) => {
    const card = cards.get(id);
    if (!card || card.status !== 'PUBLISHED' || card.isToken || card.isChampionToken) throw new Error('공개된 일반 카드만 공유할 수 있습니다.');
    return { id, count, revision: deckEntityRevision(card) };
  });
  const result = { name: name.trim(), championId: champion.id, championRevision: deckEntityRevision(champion), cards: entries };
  const check = inspectSharedDeck(result, { cards: [...cards.values()], champions: [champion] }, [champion]);
  if (check.ruleIssues.length) throw new Error(check.ruleIssues.join(' '));
  encodeDeck(result);
  return result;
}
export function inspectSharedDeck(deck: SharedDeck, options: DeckOptions, catalogChampions: DeckChampion[]) {
  const cardsById = new Map(options.cards.filter(c => c.status === 'PUBLISHED').map(c => [c.id, c]));
  const champion = catalogChampions.find(c => c.id === deck.championId && c.status === 'PUBLISHED');
  const ruleIssues: string[] = [], ownershipIssues: string[] = [], changed: string[] = [];
  if (!champion) ruleIssues.push('삭제되었거나 공개되지 않은 챔피언입니다.');
  else {
    if (!options.champions.some(c => c.id === champion.id)) ownershipIssues.push(`${champion.name}: 미보유 챔피언`);
    if (deck.championRevision !== deckEntityRevision(champion)) changed.push(champion.name);
  }
  let legendary = 0;
  const rows = deck.cards.map(entry => {
    const card = cardsById.get(entry.id);
    if (!card || card.isToken || card.isChampionToken) ruleIssues.push(`${entry.id}: 삭제되었거나 사용할 수 없는 카드`);
    if (card) {
      if (entry.count > maxCardCopies(card.rarity)) ruleIssues.push(`${card.name}: 동일 카드 최대 ${maxCardCopies(card.rarity)}장`);
      if (card.rarity === 'LEGENDARY') legendary += entry.count;
      if ((card.quantity ?? 0) < entry.count) ownershipIssues.push(`${card.name}: ${entry.count - (card.quantity ?? 0)}장 부족`);
      if (entry.revision !== deckEntityRevision(card)) changed.push(card.name);
    }
    return { ...entry, card };
  });
  const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
  for (const reason of validateDeckCounts({ cardCount: total, legendaryCount: legendary, championCount: champion ? 1 : 0 })) {
    if (reason === 'INVALID_CARD_COUNT') ruleIssues.push(`정확히 ${DECK_SIZE}장이 필요합니다.`);
    if (reason === 'TOO_MANY_LEGENDARIES') ruleIssues.push(`레전더리 총 ${MAX_LEGENDARY_CARDS}장 제한`);
  }
  return { champion, rows, ruleIssues, ownershipIssues, changed, total };
}

import type { CardInstance } from '../cards/types';
import type { GameState, PlayerState } from '../types/game-state';
import type { Relic } from '../../../../../lib/game-engine/src/tower/types';
import { drawCard } from '../engine/draw-card';
import { createDeterministicRandom } from '../random/random';
import type { GameEvent } from '../events/types';

export interface TowerBattleContext {
  playerId: string;
  relics: Array<Pick<Relic, 'id' | 'effectType' | 'values'>>;
  emptyFieldLockEventIndex?: number;
  survived?: boolean;
  nextEntryBuffs?: number;
  processedRemovalKeys?: string[];
  usedTurn?: Record<string, number>;
  firstDamageTurn?: Record<string, number>;
  auraStats?: Record<string, { attack: number; health: number }>;
  questBonusUsed?: boolean;
}
export function towerRelics(state: GameState, playerId: string) {
  return state.tower?.playerId === playerId ? state.tower.relics : [];
}
/** All relic HP penalties pass through this floor; ordinary combat damage does not. */
export function applyRelicHealthPenalty(card: CardInstance, amount: number): CardInstance {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('유물 체력 감소 수치는 0 이상의 유한한 숫자여야 합니다.');
  return { ...card, currentHealth: Math.max(1, card.currentHealth - amount) };
}
export function towerFieldLimit(state: GameState, playerId: string): number {
  const effects = towerRelics(state, playerId);
  return effects.some(relic => relic.effectType === 'MAX_FIELD_ONE') ? 1
    : effects.some(relic => relic.effectType === 'MAX_FIELD_TWO') ? 2 : 4;
}
export function canEnterTowerField(state: GameState, playerId: string): boolean {
  const player = state.players.find(candidate => candidate.id === playerId);
  const effects = towerRelics(state, playerId);
  if (effects.length && (state.tower?.emptyFieldLockEventIndex === towerTurnStartIndex(state) ||
    (effects.some(relic => relic.effectType === 'FIRST_SUMMON_COST_DOWN_LIMIT') && towerTurnEntries(state, playerId).length > 0))) return false;
  return Boolean(player && player.board.filter(Boolean).length < towerFieldLimit(state, playerId));
}
function towerTurnStartIndex(state: GameState): number {
  let start = state.events.length - 1;
  while (start >= 0 && state.events[start]?.type !== 'TURN_STARTED') start--;
  return start;
}
function towerTurnNumber(state: GameState): number {
  return state.events.filter(event => event.type === 'TURN_STARTED').length || state.turn;
}
function towerTurnEntries(state: GameState, playerId: string) {
  return state.events.slice(towerTurnStartIndex(state) + 1).filter(event => event.type === 'ENTER_FIELD' && event.playerId === playerId);
}
export function towerSummonCost(state: GameState, playerId: string, baseCost: number): number {
  const effects = towerRelics(state, playerId);
  if (!effects.length || towerTurnEntries(state, playerId).length > 0) return baseCost;
  const discount = effects.reduce((sum, relic) => sum + (relic.effectType === 'FIRST_SUMMON_COST_DOWN_LIMIT' ? relic.values.amount ?? 1
    : relic.effectType === 'FIRST_SUMMON_COST_DOWN_NO_ATTACK' ? relic.values.amount ?? 2 : 0), 0);
  return Math.max(0, baseCost - discount);
}
export function towerAttackBlocked(state: GameState, playerId: string, cardId: string): boolean {
  if (!towerRelics(state, playerId).some(relic => relic.effectType === 'FIRST_SUMMON_COST_DOWN_NO_ATTACK')) return false;
  return towerTurnEntries(state, playerId)[0]?.cardInstanceId === cardId;
}
export function towerContextAfterEntry(state: GameState, playerId: string): TowerBattleContext | undefined {
  if (!state.tower || state.tower.playerId !== playerId) return state.tower;
  if (!towerTurnEntries(state, playerId).length && state.players.find(p => p.id === playerId)?.board.every(card => card === null) &&
    state.tower.relics.some(relic => relic.effectType === 'EMPTY_FIELD_FIRST_SUMMON_BUFF')) return { ...state.tower, emptyFieldLockEventIndex: towerTurnStartIndex(state) };
  return state.tower;
}
export function towerOpenSlot(state: GameState, playerId: string): number {
  if (!canEnterTowerField(state, playerId)) return -1;
  return state.players.find(player => player.id === playerId)?.board.findIndex(card => card === null) ?? -1;
}
export function applyTowerEntryStats(state: GameState, playerId: string, card: CardInstance): CardInstance {
  const effects = towerRelics(state, playerId);
  let attack = 0; let health = 0;
  let temporaryAttack = 0;
  const first = effects.length > 0 && towerTurnEntries(state, playerId).length === 0;
  const revenge = state.tower?.playerId === playerId ? state.tower.nextEntryBuffs ?? 0 : 0;
  for (const relic of effects) {
    if (relic.effectType === 'MAX_FIELD_ONE' || relic.effectType === 'MAX_FIELD_TWO') {
      const fallback = relic.effectType === 'MAX_FIELD_ONE' ? 4 : 2;
      attack += relic.values.attack ?? fallback; health += relic.values.health ?? fallback;
    }
    if (first && relic.effectType === 'FIRST_SUMMON_TEMP_ATK') temporaryAttack += relic.values.attack ?? 3;
    if (relic.effectType === 'ON_RETIRE_NEXT_BUFF' && revenge) {
      attack += (relic.values.attack ?? 2) * revenge; health += (relic.values.health ?? 2) * revenge;
    }
    if (first && relic.effectType === 'EMPTY_FIELD_FIRST_SUMMON_BUFF' && state.players.find(p => p.id === playerId)?.board.every(card => card === null)) {
      attack += relic.values.attack ?? 3; health += relic.values.health ?? 3;
    }
  }
  return attack || health || temporaryAttack ? { ...card, currentAttack: card.currentAttack + attack + temporaryAttack, currentHealth: card.currentHealth + health, maxHealth: card.maxHealth + health,
    ...(temporaryAttack ? { temporaryStatModifiers: [...(card.temporaryStatModifiers ?? []), { source: 'TOWER_RELIC' as const, stat: 'attack' as const, amount: temporaryAttack, untilTurn: towerTurnNumber(state) }] } : {}) } : card;
}

/** Relic replacement is independent of a card's silence and consumes its battle use before effects. */
export function preventTowerRetire(state: GameState, playerId: string, card: CardInstance): GameState {
  if (!state.tower || state.tower.playerId !== playerId || state.tower.survived || card.cardType !== 'WRESTLER' || card.isChampionToken || card.isDirectDeployedChampion ||
    !towerRelics(state, playerId).some(r => r.effectType === 'FIRST_RETIRE_SURVIVE')) return state;
  return { ...state, tower: { ...state.tower, survived: true },
    preventedRetireTargetIds: [...(state.preventedRetireTargetIds ?? []), card.instanceId],
    players: state.players.map(p => p.id !== playerId ? p : { ...p, board: p.board.map(c => c?.instanceId === card.instanceId ? { ...c, currentHealth: 1 } : c) as typeof p.board }) };
}

function buffBoard(state: GameState, playerId: string, ids: string[], attack: number, health: number): GameState {
  return { ...state, players: state.players.map(p => p.id !== playerId ? p : { ...p,
    board: p.board.map(c => c && ids.includes(c.instanceId) ? { ...c, currentAttack: Math.max(0, c.currentAttack + attack), currentHealth: c.currentHealth + health, maxHealth: c.maxHealth + health } : c) as typeof p.board }) };
}
function relicDraw(state: GameState, playerId: string, amount: number): GameState {
  let next = state;
  for (let i = 0; i < amount && next.status === 'IN_PROGRESS'; i++) next = drawCard(next, playerId);
  return next;
}
/** Event identities are recorded before drawing, preventing reentrant retirement/draw loops. */
export function resolveTowerRemoval(state: GameState, event: GameEvent, eventIndex: number): GameState {
  if (!state.tower || (event.type !== 'CARD_RETIRED' && event.type !== 'CARD_DESTROYED') || event.cardType !== 'WRESTLER') return state;
  const key = `${eventIndex}:${event.type}:${event.cardInstanceId}`;
  if (state.tower.processedRemovalKeys?.includes(key)) return state;
  const playerId = state.tower.playerId;
  let next = { ...state, tower: { ...state.tower, processedRemovalKeys: [...(state.tower.processedRemovalKeys ?? []), key] } } as GameState;
  const turn = towerTurnStartIndex(state);
  for (const relic of towerRelics(state, playerId)) {
    const once = (amount: number) => {
      if (next.tower!.usedTurn?.[relic.id] === turn) return;
      next = { ...next, tower: { ...next.tower!, usedTurn: { ...next.tower!.usedTurn, [relic.id]: turn } } };
      next = relicDraw(next, playerId, amount);
    };
    if (event.type === 'CARD_RETIRED' && event.playerId === playerId) {
      if (relic.effectType === 'ON_RETIRE_NEXT_BUFF') next = { ...next, tower: { ...next.tower!, nextEntryBuffs: (next.tower!.nextEntryBuffs ?? 0) + 1 } };
      if (relic.effectType === 'ON_RETIRE_DRAW') once(relic.values.amount ?? 1);
      if (relic.effectType === 'ON_RETIRE_RANDOM_ALLY_BUFF') {
        const allies = next.players.find(p => p.id === playerId)!.board.filter((c): c is CardInstance => !!c && c.instanceId !== event.cardInstanceId && c.currentHealth > 0 && !c.isChampionToken && !c.isDirectDeployedChampion);
        if (allies.length) {
          const random = createDeterministicRandom(`${state.randomSeed}:relic:${relic.id}:${eventIndex}`);
          next = buffBoard(next, playerId, [allies[Math.floor(random() * allies.length)]!.instanceId], relic.values.attack ?? 1, relic.values.health ?? 2);
        }
      }
    }
    if (event.playerId !== playerId && event.type === 'CARD_DESTROYED' && relic.effectType === 'ON_DESTROY_DRAW') once(relic.values.amount ?? 2);
    if (event.playerId !== playerId && event.type === 'CARD_RETIRED') {
      const sourceId = event.source?.type === 'CARD' ? event.source.cardInstanceId : undefined;
      if (sourceId && relic.effectType === 'ON_RETIRE_KILL_BUFF' && next.players.find(p => p.id === playerId)!.board.some(c => c?.instanceId === sourceId))
        next = buffBoard(next, playerId, [sourceId], relic.values.attack ?? 2, 0);
      if (relic.effectType === 'MULTI_RETIRE_DRAW') {
        const count = next.events.slice(turn + 1, eventIndex + 1).filter(e => e.type === 'CARD_RETIRED' && e.cardType === 'WRESTLER' && e.playerId !== playerId && e.sourceContext?.sourcePlayerId === playerId).length;
        if (count >= (relic.values.threshold ?? 2)) once(relic.values.amount ?? 2);
      }
    }
  }
  return refreshTowerAuras(next);
}

/** Live aura deltas are removed before recomputation. Highest ATK ties use the leftmost slot. */
export function refreshTowerAuras(state: GameState): GameState {
  if (!state.tower) return state;
  const playerId = state.tower.playerId;
  const player = state.players.find(p => p.id === playerId);
  if (!player) return state;
  const old = state.tower.auraStats ?? {};
  const base = player.board.map(c => c ? { ...c, currentAttack: c.currentAttack - (old[c.instanceId]?.attack ?? 0),
    currentHealth: c.currentHealth - (old[c.instanceId]?.health ?? 0), maxHealth: c.maxHealth - (old[c.instanceId]?.health ?? 0) } : null) as typeof player.board;
  const allies = base.filter((c): c is CardInstance => !!c && !c.isChampionToken && !c.isDirectDeployedChampion);
  const enemyCount = state.players.find(p => p.id !== playerId)?.board.filter(c => c && !c.isChampionToken && !c.isDirectDeployedChampion).length ?? 0;
  const leader = allies.reduce<CardInstance | undefined>((best, c) => !best || c.currentAttack > best.currentAttack ? c : best, undefined);
  const auraStats: NonNullable<TowerBattleContext['auraStats']> = {};
  for (const card of allies) {
    let attack = 0; let health = 0;
    for (const relic of towerRelics(state, playerId)) {
      if (relic.effectType === 'SOLO_BUFF' && allies.length === 1) { attack += relic.values.attack ?? 3; health += relic.values.health ?? 3; }
      if (relic.effectType === 'OUTNUMBERED_ATK_BUFF' && allies.length < enemyCount) attack += relic.values.attack ?? 2;
      // Current visible HP, including other health auras, defines the one-HP condition.
      if (relic.effectType === 'HIGHEST_ATK_LEADER_BUFF') {
        if (card.instanceId === leader?.instanceId) { attack += relic.values.attack ?? 2; health += relic.values.health ?? 2; }
        else attack -= relic.values.penalty ?? 1;
      }
    }
    const visibleHealth = card.currentHealth + health;
    if (visibleHealth === 1) for (const relic of towerRelics(state, playerId)) if (relic.effectType === 'ONE_HP_ATK_BUFF') attack += relic.values.attack ?? 3;
    attack = Math.max(-card.currentAttack, attack);
    auraStats[card.instanceId] = { attack, health };
  }
  const board = base.map(c => {
    if (!c) return c;
    const delta = auraStats[c.instanceId] ?? { attack: 0, health: 0 };
    // Removing an HP aura cannot itself retire a living wrestler.
    const wasAlive = player.board.find(oldCard => oldCard?.instanceId === c.instanceId)!.currentHealth > 0;
    return { ...c, currentAttack: c.currentAttack + delta.attack, currentHealth: wasAlive ? Math.max(1, c.currentHealth + delta.health) : c.currentHealth + delta.health, maxHealth: c.maxHealth + delta.health };
  }) as typeof player.board;
  return { ...state, tower: { ...state.tower, auraStats }, players: state.players.map(p => p.id === playerId ? { ...p, board } : p) };
}

export function towerCombatAttackBonus(state: GameState, playerId: string, attacker: CardInstance, defender: CardInstance): number {
  return towerRelics(state, playerId).reduce((sum, r) => sum + (r.effectType === 'ATTACK_HIGHER_ATK_BUFF' && defender.currentAttack > attacker.currentAttack ? r.values.attack ?? 3
    : r.effectType === 'ATTACK_LOWER_ATK_BUFF' && defender.currentAttack < attacker.currentAttack ? r.values.attack ?? 2 : 0), 0);
}
export function towerIncomingDamage(state: GameState, playerId: string, card: CardInstance, amount: number, attackingHighest = false): { state: GameState; amount: number } {
  if (amount <= 0 || state.tower?.playerId !== playerId || card.isChampionToken || card.isDirectDeployedChampion) return { state, amount };
  const turn = towerTurnStartIndex(state);
  const relics = towerRelics(state, playerId);
  const firstReduction = state.tower.firstDamageTurn?.[card.instanceId] !== turn ? relics.filter(r => r.effectType === 'FIRST_DAMAGE_REDUCTION').reduce((n, r) => n + (r.values.reduction ?? 2), 0) : 0;
  const combatReduction = attackingHighest ? relics.filter(r => r.effectType === 'ATTACK_HIGHEST_DAMAGE_REDUCTION').reduce((n, r) => n + (r.values.reduction ?? 2), 0) : 0;
  return { state: firstReduction ? { ...state, tower: { ...state.tower, firstDamageTurn: { ...state.tower.firstDamageTurn, [card.instanceId]: turn } } } : state, amount: Math.max(0, amount - firstReduction - combatReduction) };
}
export function towerTurnStart(state: GameState, playerId: string): GameState {
  if (state.tower?.playerId !== playerId) return state;
  let next = refreshTowerAuras(state);
  const allies = next.players.find(p => p.id === playerId)!.board.filter((c): c is CardInstance => !!c && !c.isChampionToken && !c.isDirectDeployedChampion);
  if (allies.length === 1) for (const r of towerRelics(next, playerId)) if (r.effectType === 'SOLO_TURN_START_HEAL_BUFF') {
    const card = allies[0]!;
    next = buffBoard(next, playerId, [card.instanceId], r.values.attack ?? 1, 0);
    next = { ...next, players: next.players.map(p => p.id !== playerId ? p : { ...p, board: p.board.map(c => c?.instanceId === card.instanceId ? { ...c, currentHealth: Math.min(c.maxHealth, c.currentHealth + (r.values.heal ?? 2)) } : c) as typeof p.board }) };
  }
  return refreshTowerAuras(next);
}
export function towerQuestProgressBonus(state: GameState, playerId: string): { state: GameState; amount: number } {
  if (state.tower?.playerId !== playerId || state.tower.questBonusUsed) return { state, amount: 0 };
  const amount = towerRelics(state, playerId).filter(r => r.effectType === 'QUEST_PROGRESS_BONUS').reduce((n, r) => n + (r.values.amount ?? 1), 0);
  return { state: amount ? { ...state, tower: { ...state.tower, questBonusUsed: true } } : state, amount };
}
export function towerQuestComplete(state: GameState, playerId: string): GameState {
  const ids = state.players.find(p => p.id === playerId)?.board.filter((c): c is CardInstance => !!c && !c.isChampionToken && !c.isDirectDeployedChampion).map(c => c.instanceId) ?? [];
  let next = state;
  for (const r of towerRelics(state, playerId)) if (r.effectType === 'QUEST_COMPLETE_FIELD_BUFF') next = buffBoard(next, playerId, ids, r.values.attack ?? 2, r.values.health ?? 2);
  return refreshTowerAuras(next);
}
/** First-entry buffs can occur during an opponent turn; expire only tagged relic modifiers. */
export function expireTowerOpponentTurnBuffs(state: GameState, player: PlayerState): PlayerState {
  if (state.tower?.playerId !== player.id) return player;
  const expire = (card: CardInstance): CardInstance => {
    const expired = card.temporaryStatModifiers?.filter(modifier => modifier.source === 'TOWER_RELIC' && modifier.untilTurn === state.turn) ?? [];
    if (!expired.length) return card;
    return { ...card, currentAttack: card.currentAttack - expired.reduce((sum, modifier) => sum + (modifier.stat === 'attack' ? modifier.amount : 0), 0),
      temporaryStatModifiers: card.temporaryStatModifiers?.filter(modifier => !expired.includes(modifier)) };
  };
  return { ...player, board: player.board.map(card => card ? expire(card) : null) as typeof player.board,
    hand: player.hand.map(expire), deck: player.deck.map(expire) };
}
export function expireTowerTurnEndBuffs(state: GameState, endingTurn: number): GameState {
  if (!state.tower) return state;
  const expiryState = { ...state, turn: endingTurn };
  return { ...state, players: state.players.map(player => expireTowerOpponentTurnBuffs(expiryState, player)) };
}

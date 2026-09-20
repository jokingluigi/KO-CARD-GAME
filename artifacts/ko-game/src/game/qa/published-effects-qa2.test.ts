import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from '../cards/published-cards';
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from '../champions/published-champions';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { directDeployChampionToken } from '../engine/champion-token';
import { attack } from '../engine/combat';
import { destroyCard } from '../engine/destroy-card';
import { enterField } from '../engine/enter-field';
import { endTurn } from '../engine/turn-system';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { playTechniqueFromHand } from '../engine/play-technique';
import { canUseChampionAbility, useChampionAbility } from '../engine/champion-system';
import { processChampionQuestEvents } from '../champions/quests';
import { selectEffectTarget, resolveTriggeredAbilities, getDamageModifierBonus } from '../effects/effect-engine';
import type { GameEvent } from '../events/types';
import type { ChampionDefinition } from '../champions/types';
import type { GameState } from '../types/game-state';

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? 'http://127.0.0.1:8080';
const response = await fetch(`${apiOrigin}/api/cards`);
if (!response.ok) throw new Error(`QA2 card catalog request failed: ${response.status}`);
const records = ((await response.json()) as { cards?: PublishedCardRecord[] }).cards ?? [];
const definitions = records.filter((record) => record.status === 'PUBLISHED').map(cardRecordToDefinition);

function card(name: string, instanceId: string, patch: Partial<CardInstance> = {}): CardInstance {
  const definition = definitions.find((item) => item.name === name);
  assert.ok(definition, `published definition missing: ${name}`);
  return { ...generateCardInstance(definition, { instanceId, isGenerated: false }), ...patch };
}

function stateWithPool(): GameState {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.turn = 1;
  state.randomSeed = 20260920;
  state.cardPool = definitions;
  state.players = state.players.map((player) => ({
    ...player,
    currentGold: 10,
    hand: [],
    deck: [],
    graveyard: [],
    board: [null, null, null, null],
  }));
  return state;
}

function withBoard(
  state: GameState,
  playerId: string,
  board: Array<CardInstance | null>,
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, board: board as typeof player.board } : player,
    ),
  };
}

function boardCard(state: GameState, playerId: string, instanceId: string): CardInstance {
  const result = state.players
    .find((player) => player.id === playerId)
    ?.board.find((item) => item?.instanceId === instanceId);
  assert.ok(result, `board card missing: ${instanceId}`);
  return result;
}

function chooseEveryPendingTarget(state: GameState): GameState {
  let current = state;
  for (let step = 0; current.targetingState?.active; step += 1) {
    assert.ok(step < 20, 'target continuation did not settle');
    const pending = current.targetingState;
    assert.ok(pending.validTargetIds.length > 0, 'mandatory effect has no valid target');
    const invalid = selectEffectTarget(current, '__qa2_invalid_target__');
    assert.equal(invalid, current, 'invalid target changed GameState');
    current = selectEffectTarget(current, pending.validTargetIds[0]!);
  }
  return current;
}

function enterAndChoose(state: GameState, source: CardInstance, slot = 0): GameState {
  return chooseEveryPendingTarget(enterField(state, 'player-1', source, slot as 0 | 1 | 2 | 3));
}

function eventFor(state: GameState, type: string, cardInstanceId?: string): Record<string, unknown> {
  const event = [...state.events].reverse().find((item) =>
    item.type === type && (!cardInstanceId || item.cardInstanceId === cardInstanceId),
  );
  assert.ok(event, `event missing: ${type}`);
  return event as unknown as Record<string, unknown>;
}

function expectPublishedEffectDefinitions() {
  const structured = definitions.filter((definition) => definition.effectId === 'STRUCTURED_EFFECTS_V1');
  assert.ok(structured.length >= 20, 'published structured-effect catalog unexpectedly shrank');
  for (const definition of structured) {
    const rawEffects = Array.isArray(definition.effectConfig?.effects)
      ? definition.effectConfig.effects as Array<Record<string, unknown>>
      : [];
    for (const raw of rawEffects) {
      assert.equal(typeof raw.trigger, 'string', `${definition.name}: missing trigger`);
      assert.equal(typeof raw.action, 'string', `${definition.name}: missing action`);
      assert.ok(
        definition.abilities.some((ability) =>
          ability.trigger === raw.trigger &&
          ability.effects.some((effect) => effect.type === 'STRUCTURED' && effect.action === raw.action),
        ),
        `${definition.name}: runtime mapping missing ${String(raw.trigger)}/${String(raw.action)}`,
      );
    }
  }
}

test('QA2 published catalog keeps every structured effect mapped to runtime', () => {
  expectPublishedEffectDefinitions();
});

test('QA2 RM우디르 doubles current attack and health on entry', () => {
  const source = card('RM우디르', 'qa2-rm', { currentAttack: 2, currentHealth: 3, maxHealth: 3 });
  const result = enterAndChoose(stateWithPool(), source);
  const actual = boardCard(result, 'player-1', source.instanceId);
  assert.equal(actual.currentAttack, 4);
  assert.equal(actual.currentHealth, 6);
  assert.equal(actual.maxHealth, 6);
  assert.equal((eventFor(result, 'ENTER_FIELD', source.instanceId).entryCause), 'PLAY_FROM_HAND');
});

test('QA2 generated-board buffs and aggregate references use exact values', () => {
  const state = stateWithPool();
  const generatedHand = { ...card('독세아', 'qa2-generated-hand'), isGenerated: true };
  const generatedDeck = { ...card('독세아', 'qa2-generated-deck'), isGenerated: true };
  const generatedBoard = { ...card('독세아', 'qa2-generated-board'), isGenerated: true, boardSlot: 1 as const };
  state.players[0].hand = [generatedHand];
  state.players[0].deck = [generatedDeck];
  state.players[0].board = [null, generatedBoard, null, null];
  const deoksea = enterAndChoose(state, card('독세아', 'qa2-deoksea'), 0);
  assert.equal(deoksea.players[0].hand[0]?.currentAttack, generatedHand.currentAttack + 1);
  assert.equal(deoksea.players[0].deck[0]?.currentHealth, generatedDeck.currentHealth + 1);
  assert.equal(deoksea.players[0].board[1]?.currentAttack, generatedBoard.currentAttack + 1);

  const originState = stateWithPool();
  const grave = card('RM우디르', 'qa2-origin-grave');
  originState.players[0].graveyard = [grave, card('로드', 'qa2-origin-grave-2')];
  const origin = enterAndChoose(originState, card('디 오리진', 'qa2-origin'), 0);
  assert.equal(origin.players[0].board[0]?.currentAttack, definitions.find((item) => item.name === '디 오리진')!.attack + 2);
  assert.equal(origin.players[0].board[0]?.currentHealth, definitions.find((item) => item.name === '디 오리진')!.health + 2);

  const blackState = stateWithPool();
  blackState.players[0].hand = [card('로드', 'qa2-black-hand-1'), card('로드', 'qa2-black-hand-2')];
  const black = enterAndChoose(blackState, card('블랙 마카롱', 'qa2-black'), 0);
  assert.equal(black.players[0].board[0]?.currentAttack, definitions.find((item) => item.name === '블랙 마카롱')!.attack + 2);
  assert.equal(black.players[0].board[0]?.currentHealth, definitions.find((item) => item.name === '블랙 마카롱')!.health + 2);
});

test('QA2 targeted ally and random hand buffs exclude the source and respect counts', () => {
  const state = stateWithPool();
  const ally = { ...card('로드', 'qa2-pstar-ally-1'), boardSlot: 0 as const };
  const secondAlly = { ...card('로드', 'qa2-pstar-ally-2'), boardSlot: 2 as const };
  state.players[0].board = [ally, null, secondAlly, null];
  const result = enterAndChoose(state, card('피 스타 세븐', 'qa2-pstar'), 1);
  assert.equal(result.players[0].board[0]?.currentAttack, ally.currentAttack + 2);
  assert.equal(result.players[0].board[2]?.currentAttack, secondAlly.currentAttack + 2);
  assert.equal(result.players[0].board[1]?.currentAttack, definitions.find((item) => item.name === '피 스타 세븐')!.attack);

  const handState = stateWithPool();
  handState.players[0].hand = [0, 1, 2].map((index) => card('로드', `qa2-yeoul-${index}`));
  const handResult = enterAndChoose(handState, card('여울', 'qa2-yeoul'), 0);
  assert.equal(handResult.players[0].hand.filter((item) => item.currentAttack === item.baseAttack! + 1).length, 3);
});

test('QA2 draw, mill, generated card and cost changes match zones and events', () => {
  const drawState = stateWithPool();
  const drawn = card('RM우디르', 'qa2-drawn');
  drawState.players[0].deck = [drawn];
  const drawnResult = enterAndChoose(drawState, card('로드', 'qa2-loader'), 0);
  assert.equal(drawnResult.players[0].deck.length, 0);
  assert.equal(drawnResult.players[0].hand.at(-1)?.instanceId, drawn.instanceId);
  assert.equal(eventFor(drawnResult, 'CARD_DRAWN', drawn.instanceId).cardInstanceId, drawn.instanceId);

  const millState = stateWithPool();
  const top = card('RM우디르', 'qa2-mill-top');
  const keep = card('로드', 'qa2-mill-keep');
  millState.players[0].deck = [top, keep];
  const arcanaResult = enterAndChoose(millState, card('아르카나 조커', 'qa2-arcana'), 0);
  assert.equal(arcanaResult.players[0].graveyard.at(-1)?.instanceId, top.instanceId);
  const generated = arcanaResult.players[0].deck[0];
  assert.ok(generated?.isGenerated);
  assert.equal(generated?.currentCost, Math.max(1, generated.baseCost! - 1));
  assert.equal(generated?.currentAttack, Math.max(0, generated.baseAttack! - 1));
  assert.equal(generated?.currentHealth, Math.max(1, generated.baseHealth! - 1));

  const seaState = stateWithPool();
  seaState.activePlayerId = 'player-2';
  const sea = { ...card('씨 몬스터', 'qa2-sea'), currentCost: 4 };
  seaState.players[0].hand = [sea];
  const retired = { ...card('로드', 'qa2-retired'), boardSlot: 0 as const, currentHealth: 1, maxHealth: 1 };
  seaState.players[0].board = [retired, null, null, null];
  seaState.players[1].board = [{ ...card('RM우디르', 'qa2-sea-attacker'), boardSlot: 0 as const, currentAttack: 3, enteredThisTurn: false }, null, null, null];
  const seaResult = attack(seaState, 'player-2', 'qa2-sea-attacker', { type: 'WRESTLER', playerId: 'player-1', cardInstanceId: retired.instanceId });
  assert.equal(seaResult.success, true);
  assert.equal(seaResult.state.players[0].hand[0]?.currentCost, 3);
  assert.ok(seaResult.state.events.some((item) => item.type === 'CARD_RETIRED' && item.cardInstanceId === retired.instanceId));
});

test('QA2 queued, revive and move-to-hand effects preserve timing and instances', () => {
  const queue = enterAndChoose(stateWithPool(), card('뒷정리맨', 'qa2-queue'), 0);
  assert.equal(queue.pendingCardEffects.length, 1);
  const next = card('로드', 'qa2-queued-card');
  const queueWithHand = { ...queue, players: queue.players.map((player) => player.id === 'player-1' ? { ...player, hand: [next], currentGold: 10 } : player) };
  const played = playWrestlerFromHand(queueWithHand, 'player-1', next.instanceId, 1);
  assert.equal(played.success, true);
  assert.equal(played.state.players[0].board[1]?.currentHealth, next.currentHealth + 2);
  assert.equal(played.state.pendingCardEffects.length, 0);

  const correctionState = stateWithPool();
  const grave = card('RM우디르', 'qa2-correction-grave');
  correctionState.players[0].graveyard = [grave];
  const correctionCard = card('오심정정', 'qa2-correction');
  correctionState.players[0].hand = [correctionCard];
  const correctionAction = playTechniqueFromHand(correctionState, 'player-1', correctionCard.instanceId);
  assert.equal(correctionAction.success, true);
  const correction = correctionAction.state;
  assert.equal(correction.targetingState?.validTargetIds[0], grave.instanceId);
  const corrected = selectEffectTarget(correction, grave.instanceId);
  assert.equal(corrected.players[0].graveyard.some((item) => item.instanceId === grave.instanceId), false);
  assert.equal(corrected.players[0].hand.at(-1)?.instanceId, grave.instanceId);
  assert.equal(corrected.players[0].hand.at(-1)?.boardSlot, null);

  const reviveState = stateWithPool();
  const reviveTarget = { ...card('RM우디르', 'qa2-revive-target'), currentCost: 2 };
  reviveState.players[0].graveyard = [reviveTarget];
  const revived = enterAndChoose(reviveState, card('라 칼라베라', 'qa2-reviver'), 0);
  const revivedCard = revived.players[0].board.find((item) => item?.instanceId === reviveTarget.instanceId);
  assert.ok(revivedCard);
  assert.equal(revived.players[0].graveyard.some((item) => item.instanceId === reviveTarget.instanceId), false);
  assert.equal((eventFor(revived, 'ENTER_FIELD', reviveTarget.instanceId).entryCause), 'REVIVE');
});

test('QA2 combat listeners apply exact attack, gold, dodge and silence results', () => {
  const combo = stateWithPool();
  const natomato = { ...card('나토마토', 'qa2-natomato'), boardSlot: 1 as const, enteredThisTurn: false };
  const attacker = { ...card('로드', 'qa2-combo-attacker'), boardSlot: 0 as const, enteredThisTurn: false, currentAttack: 4 };
  const enemy = { ...card('RM우디르', 'qa2-combo-enemy'), boardSlot: 0 as const, currentHealth: 10, maxHealth: 10 };
  combo.players[0].board = [attacker, natomato, null, null];
  combo.players[1].board = [enemy, null, null, null];
  const attacked = attack(combo, 'player-1', attacker.instanceId, { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: enemy.instanceId });
  assert.equal(attacked.success, true);
  assert.equal(attacked.state.players[0].board[1]?.currentAttack, natomato.currentAttack + attacker.currentAttack);
  const ended = endTurn(attacked.state, 'player-1');
  assert.equal(ended.success, true);
  assert.equal(ended.state.players[0].board[1]?.currentAttack, 0);

  const boardba = { ...card('보드바', 'qa2-boardba'), boardSlot: 0 as const, enteredThisTurn: false };
  const boardState = stateWithPool();
  boardState.players[0].board = [boardba, null, null, null];
  boardState.players[1].board = [{ ...card('로드', 'qa2-boardba-target'), boardSlot: 0 as const, currentHealth: 10, maxHealth: 10 }, null, null, null];
  const boardAttack = attack(boardState, 'player-1', boardba.instanceId, { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'qa2-boardba-target' });
  assert.equal(boardAttack.success, true);
  assert.equal(boardAttack.state.players[0].nextTurnGoldBonus, 1);

  const lunaState = stateWithPool();
  const luna = { ...card('루나', 'qa2-luna'), boardSlot: 0 as const, enteredThisTurn: false };
  const enemyAttacker = { ...card('로드', 'qa2-luna-attacker'), boardSlot: 0 as const, enteredThisTurn: false, currentAttack: 1 };
  lunaState.players[0].board = [luna, null, null, null];
  lunaState.players[1].board = [enemyAttacker, null, null, null];
  lunaState.activePlayerId = 'player-2';
  const lunaAttack = attack(lunaState, 'player-2', enemyAttacker.instanceId, { type: 'WRESTLER', playerId: 'player-1', cardInstanceId: luna.instanceId });
  assert.equal(lunaAttack.success, true);
  assert.equal(lunaAttack.state.players[1].board[0]?.isSilenced, true);
  assert.equal(lunaAttack.state.players[0].board[0]?.isAbilityDisabled, true);
});

test('QA2 conditional and state-status effects expose exact board results', () => {
  const pandoraState = stateWithPool();
  const target = { ...card('RM우디르', 'qa2-pandora-target'), boardSlot: 0 as const, currentHealth: 2, maxHealth: 2 };
  pandoraState.players[1].board = [target, null, null, null];
  const pandora = enterField(pandoraState, 'player-1', card('판도라', 'qa2-pandora'), 0);
  const pandoraResult = selectEffectTarget(pandora, target.instanceId);
  assert.equal(pandoraResult.players[1].board[0]?.currentHealth, 1);
  assert.equal(pandoraResult.players[0].board[0]?.currentAttack, definitions.find((item) => item.name === '판도라')!.attack + 2);
  assert.equal(pandoraResult.players[0].board[0]?.currentHealth, definitions.find((item) => item.name === '판도라')!.health + 2);

  const purpleState = stateWithPool();
  const purpleTarget = { ...card('RM우디르', 'qa2-purple-target'), boardSlot: 0 as const, currentAttack: 2, currentHealth: 4, maxHealth: 4 };
  purpleState.players[1].board = [purpleTarget, null, null, null];
  const purple = enterAndChoose(purpleState, card('퍼플레인', 'qa2-purple'), 0);
  assert.equal(purple.players[1].board[0]?.currentAttack, 0);
  assert.equal(purple.players[1].board[0]?.isStunned, true);
  assert.equal(purple.players[1].board[0]?.isSilenced, true);

  const platinumState = stateWithPool();
  platinumState.players[0].currentGold = 3;
  const platinum = enterAndChoose(platinumState, card('플래티넘 구슬 마스터', 'qa2-platinum'), 0);
  assert.equal(platinum.players[0].currentGold, 0);
  assert.equal(platinum.players[0].board[0]?.currentAttack, definitions.find((item) => item.name === '플래티넘 구슬 마스터')!.attack + 6);
  assert.equal(platinum.players[0].board[0]?.currentHealth, definitions.find((item) => item.name === '플래티넘 구슬 마스터')!.health + 6);
});

test('QA2 summon and aggregate effects mark generated cards and suppress SUMMON entry effects', () => {
  const jokerState = stateWithPool();
  const joker = enterAndChoose(jokerState, card('조킹루이지', 'qa2-joker'), 1);
  const summoned = joker.players[0].board.filter((item) => item?.instanceId !== 'qa2-joker' && item !== null);
  assert.equal(Boolean(joker.players[0].board[0]), true);
  assert.equal(Boolean(joker.players[0].board[2]), true);
  assert.equal(summoned.length, 2);
  assert.ok(summoned.every((item) => item.isGenerated));
  assert.ok(summoned.every((item) => item.keywords.includes('TAUNT')));
  assert.ok(summoned.every((item) => item.abilities.every((ability) => ability.trigger !== 'ENTER_FIELD') || !joker.events.some((event) => event.type === 'CARD_PLAYED' && event.cardInstanceId === item.instanceId)));
  assert.ok(joker.events.some((item) => item.type === 'ENTER_FIELD' && item.entryCause === 'SUMMON'));

  const origin = stateWithPool();
  const generatedOne = { ...card('로드', 'qa2-zombie-source-1'), isGenerated: true, currentAttack: 2, currentHealth: 3, maxHealth: 3, boardSlot: 0 as const };
  const generatedTwo = { ...card('로드', 'qa2-zombie-source-2'), isGenerated: true, currentAttack: 4, currentHealth: 5, maxHealth: 5, boardSlot: 1 as const };
  origin.players[0].board = [generatedOne, generatedTwo, null, null];
  const zombie = enterAndChoose(origin, card('발단', 'qa2-origin'), 2);
  assert.equal(zombie.players[0].board.some((item) => item?.instanceId === generatedOne.instanceId), false);
  assert.equal(zombie.players[0].board.some((item) => item?.instanceId === generatedTwo.instanceId), false);
  const zombieCard = zombie.players[0].board.find((item) => item?.definitionId === definitions.find((item) => item.name === '좀비')?.id);
  assert.ok(zombieCard);
  assert.equal(zombieCard.currentAttack, 6);
  assert.equal(zombieCard.currentHealth, 8);
  assert.ok(zombieCard.keywords.includes('TAUNT'));
  assert.ok(zombie.events.some((item) => item.type === 'CARD_RETIRED' && item.cardInstanceId === generatedOne.instanceId) === false);
});

test('QA2 token generation paths preserve isGenerated, definition and no hand-entry replay', () => {
  const tokenNames = ['용병', '엘리트 용병', '잔상', '위리녀', '좀비'];
  for (const name of tokenNames) {
    const definition = definitions.find((item) => item.name === name);
    assert.ok(definition, `token missing: ${name}`);
    assert.equal(definition.isToken, true);
    const state = stateWithPool();
    const source = card('조킹루이지', `qa2-token-source-${name}`, {
      abilities: [{
        trigger: 'ENTER_FIELD',
        effects: [{
          type: 'STRUCTURED',
          action: 'SUMMON',
          values: { definitionRef: { id: definition.id }, count: 1 },
        }],
      }],
    });
    const result = enterAndChoose(state, source, 1);
    const summoned = result.players[0].board.find((item) => item?.definitionId === definition.id);
    assert.ok(summoned, `${name}: summon missing`);
    assert.equal(summoned.isGenerated, true);
    assert.equal(summoned.definitionId, definition.id);
    assert.equal(summoned.currentAttack, definition.attack);
    assert.equal(summoned.currentHealth, definition.health);
    assert.equal(result.events.some((item) => item.type === 'ENTER_FIELD' && item.cardInstanceId === summoned.instanceId && item.entryCause === 'SUMMON'), true);
    assert.equal(result.events.some((item) => item.type === 'CARD_PLAYED' && item.cardInstanceId === summoned.instanceId), false);
  }
});

test('QA2 linked Champion Token deploy is distinct from a normal summon', () => {
  const token = definitions.find((item) => item.isChampionToken);
  assert.ok(token, 'published Champion Token missing');
  const state = stateWithPool();
  const champion = state.players[0].champion;
  assert.ok(champion);
  champion.championTokenDefinitionId = token.id;
  champion.health = 13;
  state.players[0].health = 13;
  const deployed = enterField(state, 'player-1', card('RM우디르', 'qa2-champion-source'), 0);
  const direct = deployed.players[0].board.find((item) => item?.isDirectDeployedChampion);
  assert.equal(direct, undefined);
  const viaChampionDeploy = directDeployChampionToken(
    deployed,
    'player-1',
    champion.id,
    token.id,
    'QA2',
  );
  const deployedToken = viaChampionDeploy.players[0].board.find((item) => item?.isDirectDeployedChampion);
  assert.ok(deployedToken);
  assert.equal(deployedToken.isGenerated, true);
  assert.equal(deployedToken.isSilenceImmune, true);
  assert.equal(deployedToken.currentHealth, token.health + 13);
  assert.equal((eventFor(viaChampionDeploy, 'ENTER_FIELD', deployedToken.instanceId).entryCause), 'CHAMPION_DEPLOY');
});

test('QA2 active and trigger-only cards verify exact stat/status results', () => {
  const great = card('그레이트 챤', 'qa2-great', { currentAttack: 3, currentHealth: 7, maxHealth: 9 });
  const entered = enterField(stateWithPool(), 'player-1', great, 0);
  const active = resolveTriggeredAbilities(entered, 'player-1', boardCard(entered, 'player-1', great.instanceId), 'ACTIVE');
  const swapped = chooseEveryPendingTarget(active);
  assert.equal(boardCard(swapped, 'player-1', great.instanceId).currentAttack, 7);
  assert.equal(boardCard(swapped, 'player-1', great.instanceId).currentHealth, 3);

  const healerState = stateWithPool();
  const ally = { ...card('로드', 'qa2-heal-target'), boardSlot: 0 as const, currentHealth: 1, maxHealth: 5 };
  healerState.players[0].board = [ally, null, null, null];
  const healer = enterField(healerState, 'player-1', card('휴먼쿠커', 'qa2-healer'), 1);
  const healed = selectEffectTarget(healer, ally.instanceId);
  assert.equal(healed.players[0].board[0]?.currentHealth, 3);

  const dodge = {
    ...card('데헌', 'qa2-dodge'),
    statHistory: [{ stat: 'attack' as const, before: 1, after: 3, delta: 2, turnNumber: 1 }],
  };
  const dodgeState = withBoard(stateWithPool(), 'player-1', [{ ...dodge, boardSlot: 0 }, null, null, null]);
  const changed = resolveTriggeredAbilities(
    dodgeState,
    'player-1',
    boardCard(dodgeState, 'player-1', dodge.instanceId),
    'STAT_CHANGED',
    {
      attackDelta: 2,
    },
  );
  const changedCard = boardCard(changed, 'player-1', dodge.instanceId);
  assert.equal(changedCard.dodgeCharges, 1);
  assert.equal(changedCard.keywords.includes('DODGE'), true);

  const modifierSource = card('발단', 'qa2-modifier-source');
  assert.equal(getDamageModifierBonus(enterField(stateWithPool(), 'player-1', modifierSource, 0), 'player-1', modifierSource), 0);
});

test('QA2 production quest source is data-driven and Jaeger progress is exactly seven', async () => {
  const championResponse = await fetch(`${apiOrigin}/api/champions`);
  assert.equal(championResponse.ok, true);
  const championRecords = ((await championResponse.json()) as { champions?: Array<Record<string, unknown>> }).champions ?? [];
  const jaeger = championRecords.find((record) => record.name === '챔피언 예거');
  assert.ok(jaeger);
  assert.equal(jaeger.questProgressRequired, 7);
  assert.equal((jaeger.questCondition as Record<string, unknown>).required, 7);
});

test('QA2 Jaeger records every CARD_GENERATED step from 0/7 through 7/7 and activates upgrade', async () => {
  const championResponse = await fetch(`${apiOrigin}/api/champions`);
  assert.equal(championResponse.ok, true);
  const championRecords = ((await championResponse.json()) as { champions?: PublishedChampionRecord[] }).champions ?? [];
  const championDefinitions = championRecords
    .filter((record) => record.status === 'PUBLISHED')
    .map(championRecordToDefinition);
  const jaeger = championDefinitions.find((definition) => definition.name === '챔피언 예거');
  assert.ok(jaeger);
  assert.ok(jaeger.quest);
  assert.equal(jaeger.quest.requiredProgress, 7);
  const other = championDefinitions.find((definition) => definition.id !== jaeger.id);
  const state = createInitialGameState(
    [jaeger.id, other?.id ?? jaeger.id],
    definitions,
    championDefinitions,
    [[], []],
  );
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[0].currentGold = 10;
  state.players[0].board = [null, null, null, null];
  state.players[0].hand = [];

  let current = state;
  for (let count = 1; count <= 7; count += 1) {
    const generatedId = `qa2-jaeger-generated-${count}`;
    const event = {
      type: 'CARD_GENERATED',
      playerId: 'player-1',
      cardInstanceId: generatedId,
      cardType: 'WRESTLER',
      source: { type: 'SYSTEM' },
      target: { type: 'CARD', cardInstanceId: generatedId },
      reason: 'QA2',
    } as GameEvent;
    current = processChampionQuestEvents(current, {
      ...current,
      events: [...current.events, event],
    });
    const champion = current.players[0].champion;
    assert.ok(champion);
    assert.equal(champion.questProgress, count, `${count}/7`);
    assert.equal(champion.questCompleted, count === 7, `${count}/7 completion`);
    assert.ok(current.events.some((item) => item.type === 'CHAMPION_QUEST_PROGRESS' && item.amount === 1));
    if (count < 7) {
      assert.equal(current.events.some((item) => item.type === 'CHAMPION_QUEST_COMPLETED'), false);
    }
  }

  const completed = current.players[0].champion;
  assert.ok(completed?.upgradedAbility);
  assert.equal(completed.upgradedAbility?.id, jaeger.upgradedAbility?.id);
  assert.equal(canUseChampionAbility(current, 'player-1'), true);
  const abilityResult = useChampionAbility(current, 'player-1');
  assert.equal(abilityResult.success, true);
  assert.ok(abilityResult.state.events.some((item) => item.type === 'CHAMPION_ABILITY_USED'));
  assert.ok(abilityResult.state.players[0].board.some((item) => item?.isGenerated));
});

test('QA2 Champion-token retire remains a terminal loss while ordinary summon has no protection', () => {
  const token = definitions.find((item) => item.isChampionToken);
  assert.ok(token);
  const state = stateWithPool();
  const champion = state.players[0].champion;
  assert.ok(champion);
  champion.championTokenDefinitionId = token.id;
  const ordinary = generateCardInstance(token, { instanceId: 'qa2-ordinary-champion-token', isGenerated: true });
  const ordinaryState = withBoard(state, 'player-1', [ordinary, null, null, null]);
  const ordinaryRemoved = destroyCard(ordinaryState, 'player-1', ordinary.instanceId);
  assert.equal(ordinaryRemoved.success, true);
  assert.notEqual(ordinaryRemoved.state.status, 'FINISHED');
});
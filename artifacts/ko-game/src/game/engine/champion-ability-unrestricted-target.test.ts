import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import { useChampionAbility } from './champion-system';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import { selectEffectTarget } from '../effects/effect-engine';

test('unrestricted Champion PLAYER_CHOICE damages an ally or enemy wrestler and ignores invalid clicks', () => {
  const base = TEST_CHAMPIONS.find((definition) => definition.id === 'test-champion-no-quest')!;
  const pandora = {
    ...base,
    id: 'test-champion-unrestricted-choice',
    ability: {
      ...base.ability,
      effects: [{
        type: 'STRUCTURED' as const,
        action: 'DAMAGE' as const,
        target: {
          zone: 'BOARD' as const,
          owner: 'ALL' as const,
          cardType: 'WRESTLER' as const,
          selection: 'PLAYER_CHOICE' as const,
          count: 1,
        },
        values: { amount: 1 },
      }],
    },
  };
  const state = createInitialGameState(
    [pandora.id, base.id],
    undefined,
    [pandora, base],
  );
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[0].currentGold = 5;

  const ally = {
    ...state.players[0].deck[0]!,
    instanceId: 'ally-target',
    currentHealth: 3,
    maxHealth: 3,
    boardSlot: 0 as const,
  };
  const enemy = {
    ...state.players[1].deck[0]!,
    instanceId: 'enemy-target',
    currentHealth: 3,
    maxHealth: 3,
    boardSlot: 0 as const,
  };
  state.players[0].board[0] = ally;
  state.players[1].board[0] = enemy;

  const started = useChampionAbility(state, 'player-1');
  assert.equal(started.success, true);
  if (!started.success) return;
  assert.deepEqual(
    started.state.targetingState?.validTargetIds,
    [ally.instanceId, enemy.instanceId],
  );

  const invalid = selectEffectTarget(started.state, 'not-a-valid-target');
  assert.equal(invalid, started.state);
  assert.equal(invalid.players[0].board[0]?.currentHealth, 3);
  assert.equal(invalid.players[1].board[0]?.currentHealth, 3);

  const allyDamaged = selectEffectTarget(started.state, ally.instanceId);
  assert.equal(allyDamaged.players[0].board[0]?.currentHealth, 2);
  assert.equal(allyDamaged.players[1].board[0]?.currentHealth, 3);

  const enemyDamaged = selectEffectTarget(started.state, enemy.instanceId);
  assert.equal(enemyDamaged.players[0].board[0]?.currentHealth, 3);
  assert.equal(enemyDamaged.players[1].board[0]?.currentHealth, 2);
});
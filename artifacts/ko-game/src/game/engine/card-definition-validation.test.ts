import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCardDefinitionReferences } from './card-definition-validation';
import { createInitialGameState } from './create-initial-game-state';
import { TEST_CARD_DEFINITIONS } from '../cards/test-cards';

test('persisted state with an unknown CardDefinition fails explicitly', () => {
  const state = createInitialGameState(undefined, TEST_CARD_DEFINITIONS);
  const invalid = {
    ...state,
    players: state.players.map((player, index) => index === 0
      ? {
          ...player,
          hand: [{
            ...player.hand[0]!,
            definitionId: 'missing-definition',
          }],
        }
      : player),
  };

  assert.throws(
    () => validateCardDefinitionReferences(invalid),
    /알 수 없는 CardDefinition/,
  );
});

test('valid persisted state keeps its exact CardDefinition references', () => {
  assert.doesNotThrow(() => validateCardDefinitionReferences(
    createInitialGameState(undefined, TEST_CARD_DEFINITIONS),
  ));
});
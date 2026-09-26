import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChampionState } from '../game/champions/types';
import { championQuestRewardText } from './champion-quest-reward-text';

test('quest completion shows exactly the reward wording stored for Champion inspection', () => {
  const champion = { quest: {
    rewardText: "고유 능력을 강화하고 '챔피언 판도라(폭주)'를 소환합니다.",
    reward: { type: 'UPGRADE_ABILITY', effects: [] },
  } } as ChampionState;
  assert.equal(championQuestRewardText(champion), champion.quest!.rewardText);
});

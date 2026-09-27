import type { ChampionState } from '@/game';

/** The quest inspector and completion banner share the same reward copy. */
export function championQuestRewardText(champion: ChampionState): string {
  const reward = champion.quest?.reward;
  if (!reward) return '보상 없음';
  if (champion.quest?.rewardText) return champion.quest.rewardText;
  return reward.type === 'UPGRADE_ABILITY'
    ? champion.upgradedAbility?.description || `${champion.upgradedAbility?.name ?? champion.ability.name} 능력을 강화합니다.`
    : reward.type === 'GAIN_GOLD'
      ? `다음 턴 골드 ${reward.amount}를 얻습니다.`
      : reward.type === 'DIRECT_DEPLOY_CHAMPION_TOKEN'
        ? '연결된 챔피언 토큰을 직접 전개합니다.'
        : champion.upgradedAbility?.description || champion.quest?.description || '퀘스트 보상 효과를 적용합니다.';
}

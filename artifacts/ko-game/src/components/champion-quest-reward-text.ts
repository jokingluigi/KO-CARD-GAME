import type { ChampionState } from '@/game';

/** The quest inspector and completion banner share the same reward copy. */
export function championQuestRewardText(champion: ChampionState): string {
  const finisher=champion.quest?.finisher;
  if(finisher&&!champion.quest?.finisherChoices?.length)return finisher.delivery==='CAST'?'연결한 피니셔를 기본 골드 비용 없이 즉시 발동합니다.':'연결한 피니셔를 손패에 추가합니다. 손패가 가득 차면 버릴 카드를 선택합니다.';
  const reward = champion.quest?.reward;
  if (!reward) return '보상 없음';
  if (champion.quest?.rewardText) return champion.quest.rewardText;
  return reward.type === 'UPGRADE_ABILITY'
    ? champion.upgradedAbility?.description || '고유 능력을 강화합니다.'
    : reward.type === 'GAIN_GOLD'
      ? `다음 턴 골드 ${reward.amount}를 얻습니다.`
      : reward.type === 'DIRECT_DEPLOY_CHAMPION_TOKEN'
        ? '연결된 챔피언 토큰을 직접 전개합니다.'
        : champion.upgradedAbility?.description || champion.quest?.description || '현재 완료 보상 효과를 적용합니다.';
}

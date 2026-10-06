import { useEffect, useRef, useState } from "react";
import { useCinematicAvailable, useCinematicEvent } from './cinematic-layer';
import { BattleVfx } from './battle-vfx';
import { audioManager } from '@/audio/audio-manager';
import { prefersReducedMotion } from './presentation-config';
import { CardRenderer } from "./card-renderer";
import { CardArtwork } from "./card-artwork";
import { championQuestRewardText } from "./champion-quest-reward-text";
import { getCardDefinition, type GameState } from "@/game";
import type { PresentationCue } from "./presentation-feedback";

export const QUEST_BANNER_DURATION_MS = 700;
export const QUEST_REWARD_DURATION_MS = 1100;

export function QuestPresentation({
  cue,
  state,
  onComplete,
  viewerPlayerId,
}: {
  cue: PresentationCue;
  state: GameState;
  onComplete: () => void;
  viewerPlayerId: string;
}) {
  const [phase, setPhase] = useState<"BANNER" | "REWARD">("BANNER");
  const completeRef=useRef(onComplete);
  completeRef.current=onComplete;
  const reduced=prefersReducedMotion();
  const bannerDuration=reduced?180:QUEST_BANNER_DURATION_MS;
  const rewardDuration=reduced?900:QUEST_REWARD_DURATION_MS;
  const owner = state.players.find((player) => player.id === cue.playerId || player.champion?.id === cue.championId);
  const champion = owner?.champion;
  const reward = champion?.quest?.reward;
  const tokenId = reward?.type === "DIRECT_DEPLOY_CHAMPION_TOKEN"
    ? reward.cardDefinitionId
    : champion?.championTokenDefinitionId;
  const token = tokenId ? state.cardPool?.find((card) => card.id === tokenId) ?? getCardDefinition(tokenId) : undefined;
  const isViewer = owner?.id === viewerPlayerId;

  useEffect(() => {
    setPhase('BANNER');
    audioManager.duckForPresentation(.5, 500);
    const bannerTimer = window.setTimeout(() => setPhase("REWARD"), bannerDuration);
    const completeTimer = window.setTimeout(()=>completeRef.current(), bannerDuration + rewardDuration);
    return () => {
      window.clearTimeout(bannerTimer);
      window.clearTimeout(completeTimer);
    };
  }, [cue.id,bannerDuration,rewardDuration]);

  const managed=useCinematicAvailable();
  useCinematicEvent({id:cue.id,kind:'AWAKENING',title:champion?.name??'Champion',subtitle:'QUEST COMPLETE · AWAKENING',art:champion?.questCompletedPortraitEnabled&&champion.questCompletedPortraitUrl?champion.questCompletedPortraitUrl:champion?.imageUrl,duration:bannerDuration});
  if(managed && phase==='BANNER')return <div className="quest-presentation" aria-hidden="true"/>;
  return (
    <div className="quest-presentation fixed inset-0 z-[360] flex items-center justify-center bg-black/25 px-4 pointer-events-none">
      <BattleVfx kind="GOLD" seed={cue.id} left={window.innerWidth/2} top={window.innerHeight*.42} strength={10} duration={bannerDuration} />
      {phase === "BANNER" ? (
        <div className="ko-quest-chapter text-center" style={{ animation: `ko-quest-banner ${bannerDuration}ms ease both` }}>
          <p className="text-sm font-black tracking-[0.3em] text-amber-200">{isViewer ? "퀘스트 성공!" : "상대의 퀘스트 성공!"}</p>
          {champion?.imageUrl && <div className="ko-quest-chapter__portrait">
            <CardArtwork src={champion.imageUrl} alt="" className="absolute inset-0 h-full w-full" />
            {champion.questCompletedPortraitEnabled && champion.questCompletedPortraitUrl &&
              <CardArtwork src={champion.questCompletedPortraitUrl} alt="" className="ko-quest-chapter__after absolute inset-0 h-full w-full" />}
          </div>}
          <h2 className="mt-4 text-4xl font-black text-white drop-shadow-[0_3px_10px_rgba(0,0,0,.95)] sm:text-6xl">{champion?.name ?? "Champion"}</h2>
          <p className="mt-2 text-[10px] font-black tracking-[.35em] text-amber-300">새로운 국면</p>
        </div>
      ) : (
        <div data-phase="reward" className="pointer-events-auto w-full max-w-xl max-h-[80dvh] overflow-y-auto rounded-2xl border border-amber-400/60 bg-neutral-950/95 p-5 text-center shadow-2xl sm:p-7" style={{ animation: `ko-quest-reward ${rewardDuration}ms ease both` }}>
          <p className="text-xs font-black tracking-[0.25em] text-amber-300">퀘스트 보상</p>
          <h2 className="mt-2 text-2xl font-black">{champion?.name ?? "Champion"}</h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-6 text-amber-100">{champion ? championQuestRewardText(champion) : "퀘스트를 완료했습니다."}</p>
          {reward?.type === "UPGRADE_ABILITY" && champion?.upgradedAbility ? (
            <div className="mt-5 rounded-xl border border-violet-800/70 bg-violet-950/30 p-4 text-left">
              <p className="text-xs font-black text-violet-300">강화된 고유 능력</p>
              <p className="mt-2 text-lg font-black">{champion.upgradedAbility.name}</p>
              {champion.upgradedAbility.cost !== undefined && <p className="mt-1 text-sm text-amber-300">비용 {champion.upgradedAbility.cost} 골드</p>}
              <p className="mt-3 text-sm leading-6 text-neutral-300">{champion.upgradedAbility.description}</p>
            </div>
          ) : reward?.type === "DIRECT_DEPLOY_CHAMPION_TOKEN" && token ? (
            <div className="mx-auto mt-5 w-40">
              <CardRenderer
                name={token.name}
                cardType={token.cardType ?? "WRESTLER"}
                cost={token.cost}
                attack={token.attack}
                health={token.health}
                rulesText={token.rulesText}
                imageUrl={token.imageUrl}
                rarity={token.rarity}
                imageDisplaySettings={token}
                size="detail"
                className="w-full"
              />
            </div>
          ) : reward?.type === "GAIN_GOLD" ? (
            <p className="mt-5 text-xl font-black text-amber-300">골드 +{reward.amount}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

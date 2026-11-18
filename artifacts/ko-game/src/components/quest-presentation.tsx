
import {useCosmeticImage} from "./cosmetic-battle";
import { questOwner, questPortrait } from './quest-media';
import { useEffect, useRef, useState } from "react";
import { useCinematicAvailable, useCinematicEvent } from './cinematic-layer';

import { audioManager } from '@/audio/audio-manager';
import { prefersReducedMotion } from './presentation-config';
import { CardRenderer } from "./card-renderer";
import { CardArtwork } from "./card-artwork";
import { championQuestRewardText } from "./champion-quest-reward-text";
import { getCardDefinition, type GameState } from "@/game";
import type { PresentationCue } from "./presentation-feedback";
import { canPresentBattleQuest } from './quest-presentation-policy';
import { spawnArrivalBlast } from './card-arrival';
import './finisher-ready.css';

export const QUEST_BANNER_DURATION_MS = 1500;
export const QUEST_REWARD_DURATION_MS = 1100;

export function QuestPresentation(props: {
  cue: PresentationCue; state: GameState; onComplete: () => void; viewerPlayerId: string;
}) {
  return canPresentBattleQuest(props.state) ? <ActiveQuestPresentation {...props} /> : null;
}

function ActiveQuestPresentation({
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
  const owner = questOwner(state, cue.playerId, cue.championId);
  const champion = owner?.champion;
  const normalArt=useCosmeticImage(owner?.id,champion?.id,'CHAMPION_SKIN',champion?.imageUrl,'portrait');
  const awakenedArt=useCosmeticImage(owner?.id,champion?.id,'CHAMPION_SKIN',questPortrait(champion),'awakened',champion?.selectedFinisherId);
  const reward = champion?.quest?.reward;
  const tokenId = reward?.type === "DIRECT_DEPLOY_CHAMPION_TOKEN"
    ? reward.cardDefinitionId
    : champion?.championTokenDefinitionId;
  const token = tokenId ? state.cardPool?.find((card) => card.id === tokenId) ?? getCardDefinition(tokenId) : undefined;
  const isViewer = owner?.id === viewerPlayerId;

  useEffect(() => {
    setPhase('BANNER');
    audioManager.duckForPresentation(.5, bannerDuration);
    // Finisher ready: the champion is framed, gathers power and transforms with a burst.
    if(!reduced&&!document.hidden)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/finisher-ready.wav',64,8);
    const burst=reduced?null:window.setTimeout(()=>{
      const r=document.querySelector('.ko-finisher-ready__frame')?.getBoundingClientRect();
      if(r)spawnArrivalBlast({x:r.left+r.width/2,y:r.top+r.height/2,width:r.width*.9,height:r.height*.9,kind:'LEGENDARY'});
    },Math.round(bannerDuration*.4));

    const bannerTimer = window.setTimeout(() => setPhase("REWARD"), bannerDuration);
    const completeTimer = window.setTimeout(()=>completeRef.current(), bannerDuration + rewardDuration);
    return () => {
      window.clearTimeout(bannerTimer);
      if(burst!==null)window.clearTimeout(burst);
      window.clearTimeout(completeTimer);
    };
  }, [cue.id,bannerDuration,rewardDuration]);

  useCinematicAvailable();
  useCinematicEvent(null);
  if(phase==='BANNER')return (
    <div className={`quest-presentation ko-finisher-ready${isViewer?'':' ko-finisher-ready--opponent'}`} aria-hidden="true" style={{'--fr-duration':`${bannerDuration}ms`} as import('react').CSSProperties}>
      <div className="ko-finisher-ready__rays"/>
      <div className="ko-finisher-ready__frame">
        {normalArt.src&&<CardArtwork src={normalArt.src} fallbackSrc={champion?.imageUrl} displayOverride={normalArt.display} alt="" imageDisplayMode="COVER" imagePositionY={0} className="ko-finisher-ready__art"/>}
        {(awakenedArt.src??normalArt.src)&&<CardArtwork src={awakenedArt.src??normalArt.src!} fallbackSrc={questPortrait(champion)} displayOverride={awakenedArt.display} alt="" imageDisplayMode="COVER" imagePositionY={0} className="ko-finisher-ready__art ko-finisher-ready__art--awakened"/>}
        <div className="ko-finisher-ready__glow"/>
      </div>
      <div className="ko-finisher-ready__ribbon"><small>{champion?.name??'Champion'}</small><span>{isViewer?'피니셔 준비 완료!':'상대 피니셔 준비 완료!'}</span></div>
    </div>
  );
  return (
    <div className="quest-presentation fixed inset-0 z-[360] flex items-center justify-center bg-black/25 px-4 pointer-events-none">

      {(
        <div data-phase="reward" className="pointer-events-auto w-full max-w-xl max-h-[80dvh] overflow-y-auto rounded-2xl border border-amber-400/60 bg-neutral-950/95 p-5 text-center shadow-2xl sm:p-7" style={{ animation: `ko-quest-reward ${rewardDuration}ms ease both` }}>
          <p className="text-xs font-black tracking-[0.25em] text-amber-300">피니셔 획득 · 현재 완료 효과</p>
          <p className="mt-2 text-xs text-neutral-400">피니셔 카드 연계 전까지 기존 완료 효과가 적용됩니다.</p>
          <h2 className="mt-2 text-2xl font-black">{champion?.name ?? "Champion"}</h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-6 text-amber-100">{champion ? championQuestRewardText(champion) : "피니셔 준비를 완료했습니다."}</p>
          {reward?.type === "UPGRADE_ABILITY" && champion?.upgradedAbility ? (
            <div className="mt-5 rounded-xl border border-violet-800/70 bg-violet-950/30 p-4 text-left">
              <p className="text-xs font-black text-violet-300">강화된 고유 능력</p>
              {champion.upgradedAbility.cost !== undefined && <p className="mt-1 text-sm text-amber-300">비용 {champion.upgradedAbility.cost} 골드</p>}
              <p className="mt-3 text-sm leading-6 text-neutral-300">{champion.upgradedAbility.description}</p>
            </div>
          ) : reward?.type === "DIRECT_DEPLOY_CHAMPION_TOKEN" && token ? (
            <div className="mx-auto mt-5 w-40">
              <CardRenderer
                cardId={token.id} cosmeticOwnerId={owner?.id}
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

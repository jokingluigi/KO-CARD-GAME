import { useEffect, useState } from "react";
import { CardRenderer } from "./card-renderer";
import { getCardDefinition, type GameState } from "@/game";
import type { PresentationCue } from "./presentation-feedback";

export const QUEST_BANNER_DURATION_MS = 1200;
export const QUEST_REWARD_DURATION_MS = 2100;

export function QuestPresentation({
  cue,
  state,
  onComplete,
}: {
  cue: PresentationCue;
  state: GameState;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"BANNER" | "REWARD">("BANNER");
  const owner = state.players.find((player) => player.id === cue.playerId);
  const champion = owner?.champion;
  const reward = champion?.quest?.reward;
  const tokenId = reward?.type === "DIRECT_DEPLOY_CHAMPION_TOKEN"
    ? reward.cardDefinitionId
    : champion?.championTokenDefinitionId;
  const token = tokenId ? getCardDefinition(tokenId) : undefined;
  const isViewer = cue.playerId === state.players[0]?.id;

  useEffect(() => {
    const bannerTimer = window.setTimeout(() => setPhase("REWARD"), QUEST_BANNER_DURATION_MS);
    const completeTimer = window.setTimeout(onComplete, QUEST_BANNER_DURATION_MS + QUEST_REWARD_DURATION_MS);
    return () => {
      window.clearTimeout(bannerTimer);
      window.clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/25 px-4 pointer-events-none">
      {phase === "BANNER" ? (
        <div className="text-center" style={{ animation: "ko-quest-banner 1200ms ease both" }}>
          <p className="text-sm font-black tracking-[0.3em] text-amber-200">{isViewer ? "퀘스트 성공!" : "상대의 퀘스트 성공!"}</p>
          <h2 className="mt-4 text-4xl font-black text-white drop-shadow-[0_3px_10px_rgba(0,0,0,.95)] sm:text-6xl">{champion?.name ?? "Champion"}</h2>
        </div>
      ) : (
        <div className="w-full max-w-xl rounded-2xl border border-amber-400/60 bg-neutral-950/95 p-5 text-center shadow-2xl sm:p-7" style={{ animation: "ko-quest-reward 2100ms ease both" }}>
          <p className="text-xs font-black tracking-[0.25em] text-amber-300">퀘스트 보상</p>
          <h2 className="mt-2 text-2xl font-black">{champion?.name ?? "Champion"}</h2>
          {reward?.type === "UPGRADE_ABILITY" && champion?.upgradedAbility ? (
            <div className="mt-5 rounded-xl border border-violet-800/70 bg-violet-950/30 p-4 text-left">
              <p className="text-xs font-black text-violet-300">강화된 고유 능력</p>
              <p className="mt-2 text-lg font-black">{champion.upgradedAbility.name}</p>
              {champion.upgradedAbility.cost !== undefined && <p className="mt-1 text-sm text-amber-300">비용 {champion.upgradedAbility.cost}G</p>}
              <p className="mt-3 text-sm leading-6 text-neutral-300">{champion.upgradedAbility.description}</p>
            </div>
          ) : token ? (
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
          ) : (
            <p className="mt-5 text-sm leading-6 text-neutral-300">강화 효과가 적용되었습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
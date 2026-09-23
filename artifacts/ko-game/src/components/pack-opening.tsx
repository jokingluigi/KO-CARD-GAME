import { useEffect, useRef, useState } from "react";
import { Check, Gift, RotateCcw, Sparkles } from "lucide-react";
import { CardRenderer } from "@/components/card-renderer";
import { CardArtwork } from "@/components/card-artwork";
import { audioManager } from "@/audio/audio-manager";
import type { PackReward } from "@/lib/collection-client";

type PackOpeningProps = {
  packName: string;
  rewards: PackReward[];
  preview?: boolean;
  onClose: () => void;
  onRepeat?: () => void;
  onRegenerate?: () => void;
};

function rewardTitle(reward: PackReward): string {
  if (reward.rewardType === "CHAMPION_UNLOCK") return reward.champion?.name ?? "챔피언";
  if (reward.rewardType === "SKIN") return reward.skin?.name ?? "스킨";
  return reward.card?.name ?? "카드";
}

function playRevealMusic(reward: PackReward) {
  if (reward.rewardType === "LEGENDARY_CARD") {
    const card = reward.card;
    if (card?.entranceAudioEnabled && card.entranceAudioUrl) {
      audioManager.playPackRevealMusic(card.entranceAudioUrl, card.entranceAudioVolume ?? 100);
    }
  } else if (reward.rewardType === "CHAMPION_UNLOCK") {
    const champion = reward.champion;
    if (champion?.questCompleteAudioEnabled && champion.questCompleteAudioUrl) {
      audioManager.playPackRevealMusic(champion.questCompleteAudioUrl, champion.questCompleteAudioVolume ?? 100);
    }
  }
}

export function PackOpening({ packName, rewards, preview = false, onClose, onRepeat, onRegenerate }: PackOpeningProps) {
  const [revealed, setRevealed] = useState(-1);
  const lastRewardsRef = useRef<PackReward[]>(rewards);

  useEffect(() => {
    if (lastRewardsRef.current !== rewards) {
      lastRewardsRef.current = rewards;
      audioManager.stopPackRevealMusic();
      setRevealed(-1);
    }
  }, [rewards]);

  useEffect(() => {
    if (revealed >= 0) playRevealMusic(rewards[revealed]);
  }, [revealed, rewards]);

  useEffect(() => () => {
    audioManager.stopPackRevealMusic();
  }, []);

  const allRevealed = rewards.length > 0 && revealed >= rewards.length - 1;

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/95 px-5 py-8 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">{preview ? "PACK PREVIEW" : "PACK OPENING"}</p>
          <h2 className="mt-2 text-3xl font-black">{packName}</h2>
          <p className="mt-2 text-sm text-neutral-500">
            {revealed < 0 ? "카드를 눌러 한 장씩 공개하세요." : `${Math.min(revealed + 1, rewards.length)} / ${rewards.length} 공개`}
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rewards.map((reward, index) => {
            const isRevealed = revealed >= index;
            const card = reward.card;
            const champion = reward.champion;
            const skin = reward.skin;
            const isSkin = reward.rewardType === "SKIN";
            return (
              <button
                type="button"
                key={`${reward.rewardType}-${reward.cardDefinitionId ?? reward.championDefinitionId ?? reward.skinDefinitionId ?? index}`}
                onClick={() => setRevealed((current) => Math.max(current, index))}
                className={`min-w-0 text-left transition-transform ${!isRevealed ? "hover:-translate-y-1" : ""}`}
                aria-label={isRevealed ? rewardTitle(reward) : "보상 공개"}
              >
                <div className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border ${
                  isRevealed && reward.rewardType === "LEGENDARY_CARD"
                    ? "border-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.55)]"
                    : isRevealed && reward.rewardType === "CHAMPION_UNLOCK"
                      ? "border-rose-400 shadow-[0_0_28px_rgba(251,113,133,0.45)]"
                      : isRevealed && isSkin
                        ? "border-cyan-300 shadow-[0_0_28px_rgba(103,232,249,0.45)]"
                        : "border-neutral-700"
                } bg-neutral-900 ${isRevealed ? "animate-[card-flip_350ms_ease-out]" : ""}`}>
                  {!isRevealed ? (
                    <div className="text-center"><Sparkles className="mx-auto h-8 w-8 text-amber-400" /><p className="mt-3 text-xs font-black text-neutral-400">REVEAL</p></div>
                  ) : reward.rewardType === "CHAMPION_UNLOCK" ? (
                    <div className="p-3 text-center">
                      {champion?.imageUrl ? (
                        <CardArtwork
                          src={champion.imageUrl}
                          alt=""
                          className="mx-auto aspect-square w-full rounded"
                          imageDisplayMode={champion.imageDisplayMode}
                          imageScale={champion.imageScale}
                          imagePositionX={champion.imagePositionX}
                          imagePositionY={champion.imagePositionY}
                        />
                      ) : <div className="flex aspect-square items-center justify-center rounded bg-rose-950/50 text-rose-300"><Gift className="h-10 w-10" /></div>}
                      <p className="mt-3 text-sm font-black text-rose-200">{reward.alreadyOwned ? "중복 챔피언 → 챔피언 프리즘" : "챔피언 해금!"}</p>
                      <p className="mt-1 text-xs font-bold">{rewardTitle(reward)}</p>
                      {reward.alreadyOwned && reward.championPrismReward !== undefined && (
                        <p className="mt-2 rounded bg-rose-950/70 px-2 py-1 text-xs font-black text-rose-200">◈ +{reward.championPrismReward.toLocaleString()} 챔피언 프리즘</p>
                      )}
                    </div>
                  ) : card ? (
                    <CardRenderer
                      name={isSkin ? `${card.name} · ${skin?.name ?? "스킨"}` : card.name}
                      cardType={card.cardType as "WRESTLER" | "TECHNIQUE"}
                      cost={card.cost}
                      attack={card.attack}
                      health={card.health}
                      rulesText={card.text}
                      imageUrl={isSkin ? (skin?.imageUrl ?? card.imageUrl) : card.imageUrl}
                      rarity={card.rarity as "NORMAL" | "LEGENDARY"}
                      size="detail"
                      className="h-full w-full"
                    />
                  ) : <p>보상 없음</p>}
                </div>
                {isRevealed && <p className="mt-2 text-center text-xs font-bold text-neutral-300">{rewardTitle(reward)}</p>}
              </button>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {!allRevealed && <button type="button" onClick={() => setRevealed(rewards.length - 1)} className="rounded border border-amber-700 px-5 py-3 text-sm font-black text-amber-300">모두 공개</button>}
          {allRevealed && onRegenerate && <button type="button" onClick={onRegenerate} className="flex items-center gap-2 rounded border border-amber-700 px-5 py-3 text-sm font-black text-amber-300"><RotateCcw className="h-4 w-4" /> 결과 다시 생성</button>}
          {allRevealed && onRepeat && <button type="button" onClick={onRepeat} className="flex items-center gap-2 rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200"><RotateCcw className="h-4 w-4" /> 같은 팩 다시 테스트</button>}
          {allRevealed && <button type="button" onClick={onClose} className="flex items-center gap-2 rounded bg-primary px-6 py-3 text-sm font-black text-black"><Check className="h-4 w-4" /> {preview ? "팩 선택으로 돌아가기" : "확인"}</button>}
        </div>
      </div>
    </section>
  );
}
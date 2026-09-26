import { useEffect, useRef, useState } from "react";
import { Check, Gift, RotateCcw, Sparkles } from "lucide-react";
import { CardRenderer } from "@/components/card-renderer";
import { CardArtwork } from "@/components/card-artwork";
import { audioManager } from "@/audio/audio-manager";
import { aggregatePackRewards, type PackReward } from "@/lib/collection-client";

type PackOpeningProps = {
  packName: string;
  rewards: PackReward[];
  packCount?: number;
  perPackRewards?: PackReward[][];
  notice?: string;
  preview?: boolean;
  onClose: () => void;
  onRepeat?: () => void;
  onRegenerate?: () => void;
};

function rewardTitle(reward: PackReward): string {
  if (reward.rewardType === "CHAMPION_UNLOCK") return reward.champion?.name ?? "챔피언";
  if (reward.rewardType === "SKIN") return `${reward.card?.name ?? "카드"} · ${reward.skin?.name ?? "스킨"}`;
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

export function PackOpening({ packName, rewards, packCount = 1, perPackRewards, notice, preview = false, onClose, onRepeat, onRegenerate }: PackOpeningProps) {
  const [revealed, setRevealed] = useState(-1);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [specialQueue, setSpecialQueue] = useState<number[]>([]);
  const lastRewardsRef = useRef<PackReward[]>(rewards);
  const announcedThroughRef = useRef(-1);
  const bulkAnnouncedRef = useRef(false);
  const rewardsResetPendingRef = useRef(false);
  const aggregatedRewards = aggregatePackRewards(rewards);
  const isBulkResult = !preview && packCount > 1;

  useEffect(() => {
    if (lastRewardsRef.current !== rewards) {
      lastRewardsRef.current = rewards;
      audioManager.stopPackRevealMusic();
      setRevealed(-1);
      setDetailsExpanded(false);
      setSpecialQueue([]);
      announcedThroughRef.current = -1;
      bulkAnnouncedRef.current = false;
      rewardsResetPendingRef.current = true;
    }
  }, [rewards]);

  useEffect(() => {
    if (rewardsResetPendingRef.current) {
      rewardsResetPendingRef.current = false;
      return;
    }
    if (isBulkResult && !bulkAnnouncedRef.current) {
      const specials = rewards.flatMap((reward, index) =>
        reward.rewardType === "CHAMPION_UNLOCK" || reward.rewardType === "LEGENDARY_CARD" ? [index] : [],
      );
      if (specials.length) setSpecialQueue(specials);
      bulkAnnouncedRef.current = true;
    }
    if (revealed <= announcedThroughRef.current) return;
    if (!isBulkResult) {
      const specials = rewards.flatMap((reward, index) =>
        index > announcedThroughRef.current && index <= revealed &&
        (reward.rewardType === "LEGENDARY_CARD" || reward.rewardType === "CHAMPION_UNLOCK") ? [index] : [],
      );
      if (specials.length) setSpecialQueue((current) => [...current, ...specials]);
    }
    announcedThroughRef.current = revealed;
  }, [isBulkResult, revealed, rewards]);

  const specialReward = specialQueue.length ? rewards[specialQueue[0]] : undefined;
  useEffect(() => {
    if (!specialReward) return;
    playRevealMusic(specialReward);
    const timeout = window.setTimeout(() => setSpecialQueue((current) => current.slice(1)),
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 350 : 1700);
    return () => window.clearTimeout(timeout);
  }, [specialReward]);

  useEffect(() => () => {
    audioManager.stopPackRevealMusic();
  }, []);

  const allRevealed = rewards.length === 0 || revealed >= rewards.length - 1;

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/95 px-5 py-8 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl" role="dialog" aria-modal="true" aria-labelledby="pack-opening-title">
        <div className="text-center">
          <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">{preview ? "PACK PREVIEW" : "PACK OPENING"}</p>
          <h2 id="pack-opening-title" data-testid="text-pack-opening-title" className="mt-2 text-3xl font-black">{packName}</h2>
          {isBulkResult ? (
            <p data-testid="text-bulk-open-summary" className="mt-2 text-sm text-neutral-300">{packCount}개 팩 개봉 완료 · 보상 {rewards.length}개</p>
          ) : <p className="mt-2 text-sm text-neutral-500">
            {revealed < 0 ? "카드를 눌러 한 장씩 공개하세요." : `${Math.min(revealed + 1, rewards.length)} / ${rewards.length} 공개`}
          </p>}
        </div>
        {isBulkResult && (
          <section className="mt-7 rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 sm:p-6" aria-label="개봉 보상 요약">
            {notice && <p data-testid="status-pack-opening-notice" role="status" className="mb-4 rounded border border-amber-700/60 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">{notice}</p>}
            <h3 className="text-lg font-black text-amber-200">획득 보상</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              {(["NORMAL_CARD", "LEGENDARY_CARD", "CHAMPION_UNLOCK", "SKIN"] as const).map((type) => {
                const count = rewards.filter((reward) => reward.rewardType === type).length;
                const label = type === "NORMAL_CARD" ? "일반 카드" : type === "LEGENDARY_CARD" ? "레전더리" : type === "CHAMPION_UNLOCK" ? "챔피언" : "스킨";
                return <span key={type} className="rounded bg-neutral-900 px-3 py-2 text-neutral-200">{label} {count}</span>;
              })}
            </div>
            {aggregatedRewards.length > 0 ? (
              <ul data-testid="list-aggregated-rewards" className="mt-4 grid gap-2 sm:grid-cols-2">
                {aggregatedRewards.map(({ key, reward, quantity }) => (
                  <li key={key} data-testid={`text-aggregated-reward-${key}`} className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-neutral-200">{rewardTitle(reward)}</span>
                    <span className="shrink-0 rounded bg-neutral-800 px-2 py-1 font-black text-amber-200">×{quantity}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 text-sm text-neutral-400">획득한 보상이 없습니다.</p>}
            {perPackRewards && <div className="mt-4 border-t border-neutral-800 pt-4">
              <button type="button" data-testid="button-toggle-pack-details" aria-expanded={detailsExpanded} onClick={() => setDetailsExpanded((expanded) => !expanded)} className="rounded border border-neutral-700 px-4 py-2.5 text-sm font-bold text-neutral-200 hover:border-amber-500">
                {detailsExpanded ? "팩별 상세 접기" : "팩별 보상 상세 보기"}
              </button>
              {detailsExpanded && <ol data-testid="list-pack-details" className="mt-3 grid gap-2 sm:grid-cols-2">
                {perPackRewards.map((packRewards, index) => (
                  <li key={index} data-testid={`text-pack-rewards-${index + 1}`} className="rounded border border-neutral-800 bg-black/30 p-3 text-sm">
                    <p className="font-black text-amber-200">팩 {index + 1}</p>
                    <p className="mt-1 text-neutral-300">{packRewards.map(rewardTitle).join(" · ") || "보상 없음"}</p>
                  </li>
                ))}
              </ol>}
            </div>}
          </section>
        )}
        {(!isBulkResult || detailsExpanded) && <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rewards.map((reward, index) => {
            const isRevealed = revealed >= index;
            const card = reward.card;
            const champion = reward.champion;
            const skin = reward.skin;
            const isSkin = reward.rewardType === "SKIN";
            return (
              <button
                type="button"
                key={`${reward.rewardType}-${reward.cardDefinitionId ?? reward.championDefinitionId ?? reward.skinDefinitionId ?? index}-${index}`}
                onClick={() => setRevealed((current) => Math.max(current, index))}
                data-testid={`button-reveal-reward-${index}`}
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
        </div>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {isBulkResult && detailsExpanded && !allRevealed && <button type="button" data-testid="button-quick-reveal-all" onClick={() => setRevealed(rewards.length - 1)} className="rounded border border-amber-700 px-5 py-3 text-sm font-black text-amber-300">빠르게 모두 공개</button>}
          {!isBulkResult && !allRevealed && <button type="button" data-testid="button-reveal-all" onClick={() => setRevealed(rewards.length - 1)} className="rounded border border-amber-700 px-5 py-3 text-sm font-black text-amber-300">모두 공개</button>}
          {!isBulkResult && allRevealed && onRegenerate && <button type="button" onClick={onRegenerate} className="flex items-center gap-2 rounded border border-amber-700 px-5 py-3 text-sm font-black text-amber-300"><RotateCcw className="h-4 w-4" /> 결과 다시 생성</button>}
          {!isBulkResult && allRevealed && onRepeat && <button type="button" onClick={onRepeat} className="flex items-center gap-2 rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200"><RotateCcw className="h-4 w-4" /> 같은 팩 다시 테스트</button>}
          {(isBulkResult || allRevealed) && <button type="button" data-testid="button-close-pack-opening" onClick={onClose} className="flex items-center gap-2 rounded bg-primary px-6 py-3 text-sm font-black text-black"><Check className="h-4 w-4" /> {preview ? "팩 선택으로 돌아가기" : "확인"}</button>}
        </div>
      </div>
      {specialReward && (
        <div className={`pack-special pack-special--${specialReward.rewardType === "CHAMPION_UNLOCK" ? "champion" : "legendary"}`} role="status" aria-live="polite">
          <div className="pack-special__rays" aria-hidden="true" />
          <div className="pack-special__content">
            <p className="pack-special__eyebrow">{specialReward.rewardType === "CHAMPION_UNLOCK" ? "CHAMPION UNLOCKED" : "LEGENDARY PULL"}</p>
            <div className="pack-special__card">
              {specialReward.rewardType === "CHAMPION_UNLOCK" ?
                specialReward.champion?.imageUrl ? <CardArtwork src={specialReward.champion.imageUrl} alt="" className="h-full w-full" imageDisplayMode={specialReward.champion.imageDisplayMode} imageScale={specialReward.champion.imageScale} imagePositionX={specialReward.champion.imagePositionX} imagePositionY={specialReward.champion.imagePositionY} />
                  : <Gift className="h-20 w-20" />
                : specialReward.card ? <CardRenderer name={specialReward.card.name} cardType={specialReward.card.cardType as "WRESTLER" | "TECHNIQUE"} cost={specialReward.card.cost} attack={specialReward.card.attack} health={specialReward.card.health} rulesText={specialReward.card.text} imageUrl={specialReward.card.imageUrl} rarity="LEGENDARY" size="detail" className="h-full w-full" />
                  : <Gift className="h-20 w-20" />}
            </div>
            <p className="pack-special__name">{rewardTitle(specialReward)}</p>
            {specialReward.alreadyOwned && <p className="text-sm font-bold">중복 획득 · 프리즘으로 전환</p>}
            <button type="button" className="pack-special__continue" onClick={() => setSpecialQueue((current) => current.slice(1))}>계속</button>
            {specialQueue.length > 1 && <button type="button" className="text-xs font-bold underline" onClick={() => setSpecialQueue([])}>나머지 연출 건너뛰기 ({specialQueue.length - 1}개)</button>}
          </div>
        </div>
      )}
    </section>
  );
}

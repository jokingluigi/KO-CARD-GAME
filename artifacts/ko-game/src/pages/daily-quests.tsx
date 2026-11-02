import { MotionNumber } from "@/components/presentation-motion";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import {
  fetchDailyQuests,
  claimDailyQuest,
  claimDailyCompletionBonus,
  type DailyCompletionBonus,
  fetchRewardCatalogs,
  type DailyQuest,
  type RewardCatalogChampion,
  type RewardCatalogCard,
  type RewardCatalogPack,
} from "@/lib/rewards-client";
import {
  CollectionActionAnimation,
  type CollectionActionScene,
} from "@/components/collection-action-animation";

import {
  GamePageHeader,
  REWARD_PAGE_LINKS,
  SurfaceEmpty,
} from "@/components/game-page-header";
import {
  RewardDisplay,
  type RewardCatalogs,
} from "@/components/reward-display";

type RewardSummary = Pick<
  DailyQuest,
  "rewardType" | "rewardAmount" | "rewardTargetId" | "platform"
>;

function objectiveLabel(objective: string) {
  return (
    (
      {
        PLAY_MATCH: "경기 플레이",
        PLAY_DRAFT_MATCH: "드래프트 대전 완료",
        WIN_MATCH: "경기 승리",
        LOSS_MATCH: "경기 패배",
        WRESTLER_PLAYED: "선수 사용",
        CARD_RETIRED: "선수 리타이어",
        CARD_DESTROYED: "선수 파괴",
        CHAMPION_ABILITY_USED: "챔피언 고유 능력",
        FUSION: "합체",
        CARD_PLAYED: "카드 플레이",
        TECHNIQUE_PLAYED: "주문 사용",
        ATTACK_DECLARED: "공격 선언",
        DAMAGE_DEALT: "피해 주기",
      } as Record<string, string>
    )[objective] ?? objective
  );
}

export default function DailyQuestsPage() {
  const [lastBalance, setLastBalance] = useState<number | null>(null);
  const [tab, setTab] = useState<"DAILY" | "SEASON">("DAILY");
  const [seasons, setSeasons] = useState<
    Array<{ id: string; name: string; endsAt: string }>
  >([]);
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [completionBonus, setCompletionBonus] =
    useState<DailyCompletionBonus | null>(null);
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(false),
    pending = useRef(false),
    generation = useRef(0),
    readController = useRef<AbortController | null>(null);
  const [rewardScene, setRewardScene] = useState<CollectionActionScene | null>(
    null,
  );
  const [catalog, setCatalog] = useState<{
    cards: RewardCatalogCard[];
    champions: RewardCatalogChampion[];
    packs: RewardCatalogPack[];
  }>({ cards: [], champions: [], packs: [] });

  async function load() {
    if (pending.current) return;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const revision = ++generation.current;
    setLoading(true);
    setError("");
    try {
      // Reward artwork must not block progress or claiming.
      void fetchRewardCatalogs()
        .then((value) => {
          if (mounted.current) setCatalog(value);
        })
        .catch(() => {});
      const result = await fetchDailyQuests({ signal: controller.signal });
      if (!mounted.current || revision !== generation.current) return;
      setQuests(result.assignments);
      setCompletionBonus(result.completionBonus ?? null);
      setSeasons(result.seasons ?? []);
      setTimezone(result.timezone ?? "Asia/Seoul");
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "일일 퀘스트를 불러오지 못했습니다.",
        );
    } finally {
      if (mounted.current && revision === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      mounted.current = false;
      readController.current?.abort();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);

  async function claim(quest: DailyQuest) {
    if (quest.status !== "COMPLETED" || pending.current) return;
    pending.current = true;
    readController.current?.abort();
    ++generation.current;
    setError("");
    setMessage("");
    setBusyId(quest.id);
    try {
      const result = await claimDailyQuest(quest.id);
      if (!mounted.current) return;
      if (result.reward) setLastBalance(result.reward.balanceAfter);
      setQuests((current) =>
        current.map((item) =>
          item.id === quest.id ? result.assignment : item,
        ),
      );
      setMessage(
        result.alreadyClaimed
          ? "이미 받은 보상입니다."
          : rewardLabel(result.assignment),
      );
      if (!result.alreadyClaimed) {
        const reward = result.assignment;
        const item =
          reward.rewardType === "CARD"
            ? catalog.cards.find((card) => card.id === reward.rewardTargetId)
            : reward.rewardType === "CHAMPION"
              ? catalog.champions.find((c) => c.id === reward.rewardTargetId)
              : reward.rewardType === "PACK"
                ? catalog.packs.find(
                    (pack) => pack.id === reward.rewardTargetId,
                  )
                : undefined;
        setRewardScene({
          id: Date.now(),
          kind: "REWARD",
          name:
            item?.name ??
            (reward.rewardType === "CURRENCY"
              ? `${reward.rewardAmount.toLocaleString()} 크레딧`
              : "퀘스트 보상"),
          imageUrl: item?.imageUrl,
        });
      }
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error ? error.message : "보상을 받을 수 없습니다.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusyId(null);
        setLoading(false);
      }
    }
  }

  async function claimBonus() {
    if (completionBonus?.status !== "COMPLETED" || pending.current) return;
    pending.current = true;
    readController.current?.abort();
    ++generation.current;
    setError("");
    setMessage("");
    setBusyId("completion-bonus");
    try {
      const result = await claimDailyCompletionBonus();
      if (!mounted.current) return;
      setCompletionBonus(result.bonus);
      setMessage(
        result.alreadyClaimed
          ? "이미 받은 보상입니다."
          : rewardLabel(result.bonus),
      );
      if (!result.alreadyClaimed)
        setRewardScene({
          id: Date.now(),
          kind: "REWARD",
          name: rewardLabel(result.bonus),
        });
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "추가 보상을 받을 수 없습니다.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusyId(null);
        setLoading(false);
      }
    }
  }

  function rewardLabel(quest: RewardSummary): string {
    if ((quest.platform?.rewards.length ?? 0) > 1)
      return quest
        .platform!.rewards.map((r) =>
          rewardLabel({ ...quest, ...r, platform: undefined }),
        )
        .join(" + ");
    if (quest.rewardType === "CARD")
      return `카드 ${catalog.cards.find((card) => card.id === quest.rewardTargetId)?.name ?? "보상 카드"} ×${quest.rewardAmount}을 받았습니다.`;
    if (quest.rewardType === "CHAMPION")
      return `챔피언 ${catalog.champions.find((c) => c.id === quest.rewardTargetId)?.name ?? "보상 챔피언"}을 받았습니다.`;
    if (quest.rewardType === "PACK")
      return `팩 ${catalog.packs.find((pack) => pack.id === quest.rewardTargetId)?.name ?? "보상 팩"} ×${quest.rewardAmount}을 받았습니다.`;
    return `${quest.rewardAmount.toLocaleString()} 크레딧을 받았습니다.`;
  }

  const shown = quests.filter(
    (q) => (q.platform?.questType ?? "DAILY") === tab,
  );
  const ready = shown.filter((q) => q.status === "COMPLETED").length,
    claimed = shown.filter((q) => q.status === "CLAIMED").length;
  const bonusCard = tab === "DAILY" &&
    !loading &&
    completionBonus &&
    (completionBonus.enabled || completionBonus.status === "CLAIMED") && (
      <section
        className="ko-reward-today"
        aria-label="일일 퀘스트 3개 완료 보상"
      >
        <div className="ko-reward-today__copy">
          <p>오늘의 마무리 / 일일 퀘스트 3개 완료 보상</p>
          <QuestReward reward={completionBonus} catalog={catalog} />
          <div className="ko-quest-entry__progress">
            <progress
              aria-label="일일 퀘스트 완료 보상 진행도"
              value={completionBonus.progress}
              max={completionBonus.targetValue}
            />
            <span>
              {completionBonus.progress} / {completionBonus.targetValue}
            </span>
          </div>
        </div>
        <div className="ko-reward-today__action">
          <p>개별 보상 수령과 무관하게 달성 · 하루 1회</p>
          <button
            type="button"
            data-testid="button-claim-daily-completion-bonus"
            className="ko-surface-primary"
            disabled={completionBonus.status !== "COMPLETED" || Boolean(busyId)}
            onClick={() => void claimBonus()}
          >
            {busyId === "completion-bonus"
              ? "보상 확인 중…"
              : completionBonus.status === "CLAIMED"
                ? "수령 완료"
                : completionBonus.status === "COMPLETED"
                  ? "추가 보상 받기"
                  : `목표 ${Math.max(0, completionBonus.targetValue - completionBonus.progress)}개 더 완료`}
          </button>
        </div>
      </section>
    );
  return (
    <main className="ko-experience-page ko-player-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="QUEST JOURNAL"
          title="퀘스트"
          description="다음 목표를 확인하고, 플레이로 보상을 채워보세요."
          links={REWARD_PAGE_LINKS}
        />
        {error && (
          <div role="alert" className="ko-surface-message is-error">
            {error}
            <button
              type="button"
              disabled={loading || Boolean(busyId)}
              onClick={() => void load()}
            >
              다시 확인
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="ko-surface-message">
            {message}
          </p>
        )}
        {lastBalance !== null && (
          <p className="ko-surface-message" data-ui-balance>
            보유 크레딧{" "}
            <MotionNumber
              value={lastBalance}
              format={(n) => n.toLocaleString()}
            />
          </p>
        )}
        <nav className="ko-surface-tabs" aria-label="퀘스트 종류">
          {(["DAILY", "SEASON"] as const).map((t) => (
            <button
              type="button"
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "DAILY" ? "일일 퀘스트" : "시즌 퀘스트"}
            </button>
          ))}
        </nav>
        {!loading && (
          <section className="ko-quest-availability" aria-label="퀘스트 현황">
            <div>
              <strong>{ready}</strong>
              <span>받을 수 있는 보상</span>
            </div>
            <div>
              <strong>{claimed}</strong>
              <span>수령 완료</span>
            </div>
          </section>
        )}
        <p className="ko-quest-reset">
          일일 초기화 · {timezone} 00:00 / 시즌 진행도는 날짜가 바뀌어도
          유지돼요.
        </p>
        {completionBonus?.status === "COMPLETED" && bonusCard}
        {loading && !quests.length ? (
          <SurfaceEmpty title="목표를 확인하고 있어요">
            진행도와 보상을 불러오는 중이에요.
          </SurfaceEmpty>
        ) : !shown.length && !error ? (
          <SurfaceEmpty
            title="이 분류의 목표를 준비 중이에요"
            href="/online"
            label="대전 모드로"
          >
            새로운 퀘스트가 등록되면 여기에 표시돼요.
          </SurfaceEmpty>
        ) : (
          <div className="ko-quest-list">
            {shown.map((quest) => {
              const progress = Math.max(
                0,
                Math.min(quest.targetValue, quest.progress),
              );
              return (
                <article
                  className="ko-quest-entry"
                  key={quest.id}
                  data-state={quest.status}
                >
                  <div className="ko-quest-entry__icon">
                    {quest.status === "CLAIMED" ? (
                      <CheckCircle2 size={19} />
                    ) : (
                      <ListChecks size={19} />
                    )}
                  </div>
                  <div>
                    <p className="ko-quest-entry__eyebrow">
                      {quest.assignmentDate === "LIFETIME"
                        ? "상시 / 1회 한정"
                        : quest.status === "CLAIMED"
                          ? "수령 완료"
                          : quest.status === "COMPLETED"
                            ? "완료 / 보상을 받을 수 있어요"
                            : `QUEST ${quest.slot + 1}`}
                    </p>
                    <h2>{quest.title}</h2>
                    {quest.platform?.questType === "SEASON" && (
                      <p className="ko-quest-entry__description">
                        {seasons.find((s) => s.id === quest.platform?.seasonId)
                          ?.name ?? "시즌 퀘스트"}
                        {(() => {
                          const end = seasons.find(
                            (s) => s.id === quest.platform?.seasonId,
                          )?.endsAt;
                          return end && Number.isFinite(new Date(end).getTime())
                            ? ` · 종료 ${new Date(end).toLocaleDateString("ko-KR")}`
                            : " · 일정 확인 중";
                        })()}
                      </p>
                    )}
                    <p className="ko-quest-entry__description">
                      {quest.description}
                    </p>
                    <div className="ko-quest-entry__progress">
                      <progress
                        aria-label={`${quest.title} 진행도`}
                        max={Math.max(1, quest.targetValue)}
                        value={progress}
                      />
                      <span>
                        {quest.progress} / {quest.targetValue}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-neutral-500">
                      {objectiveLabel(quest.objectiveType)}
                    </p>
                  </div>
                  <div className="ko-quest-entry__reward">
                    <QuestReward reward={quest} catalog={catalog} />
                    <button
                      type="button"
                      disabled={quest.status !== "COMPLETED" || Boolean(busyId)}
                      onClick={() => void claim(quest)}
                    >
                      {busyId === quest.id
                        ? "보상 확인 중…"
                        : quest.status === "CLAIMED"
                          ? "수령 완료"
                          : quest.status === "COMPLETED"
                            ? "보상 받기"
                            : "진행 중"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {completionBonus?.status !== "COMPLETED" && bonusCard}
      </div>
      {rewardScene && (
        <CollectionActionAnimation
          scene={rewardScene}
          onComplete={() => setRewardScene(null)}
        />
      )}
    </main>
  );
}
function QuestReward({
  reward,
  catalog,
}: {
  reward: RewardSummary;
  catalog: RewardCatalogs;
}) {
  return reward.platform?.rewards.length ? (
    <span className="ko-quest-reward-stack">
      {reward.platform.rewards.map((r, i) => (
        <RewardDisplay key={i} reward={r} catalog={catalog} />
      ))}
    </span>
  ) : (
    <RewardDisplay reward={reward} catalog={catalog} />
  );
}

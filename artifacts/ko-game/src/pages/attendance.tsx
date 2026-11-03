import {ClaimAllRewardsButton} from "@/components/claim-all-rewards";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, Check, LockKeyhole } from "lucide-react";
import {
  claimAttendance,
  fetchAttendance,
  fetchRewardCatalogs,
  type AttendanceData,
} from "@/lib/rewards-client";
import {
  CollectionActionAnimation,
  type CollectionActionScene,
} from "@/components/collection-action-animation";
import { MotionNumber } from "@/components/presentation-motion";
import {
  GamePageHeader,
  REWARD_PAGE_LINKS,
  SurfaceEmpty,
} from "@/components/game-page-header";
import {
  RewardDisplay,
  type RewardCatalogs,
} from "@/components/reward-display";
export default function AttendancePage() {
  const [data, setData] = useState<AttendanceData | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [lastBalance, setLastBalance] = useState<number | null>(null),
    [scene, setScene] = useState<CollectionActionScene | null>(null),
    [catalog, setCatalog] = useState<RewardCatalogs>({
      cards: [],
      champions: [],
      packs: [],
    });
  const mounted = useRef(false),
    claiming = useRef(false),
    generation = useRef(0),
    request = useRef<AbortController | null>(null);
  async function load() {
    if (claiming.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const revision = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchAttendance({ signal: controller.signal });
      if (mounted.current && revision === generation.current) setData(next);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "출석 정보를 불러오지 못했어요.",
        );
    } finally {
      if (mounted.current && revision === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    const collected=()=>void load();
    window.addEventListener('ko-rewards-updated',collected);
    void fetchRewardCatalogs()
      .then((next) => {
        if (mounted.current) setCatalog(next);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener('ko-rewards-updated',collected);
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  async function claim() {
    const day = data?.definitions.find((d) => d.state === "AVAILABLE");
    if (claiming.current || !day || loading) return;
    claiming.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    request.current?.abort();
    ++generation.current;
    try {
      const result = await claimAttendance();
      if (!mounted.current) return;
      setData(result.attendance);
      if (result.reward) setLastBalance(result.reward.balanceAfter);
      setMessage(
        result.alreadyClaimed
          ? "오늘 출석은 이미 완료했어요."
          : "출석 보상을 받았어요. 다음 대전도 준비해 볼까요?",
      );
      if (!result.alreadyClaimed) {
        const item =
          day.rewardType === "CARD"
            ? catalog.cards.find((c) => c.id === day.rewardTargetId)
            : day.rewardType === "CHAMPION"
              ? catalog.champions.find((c) => c.id === day.rewardTargetId)
              : catalog.packs.find((c) => c.id === day.rewardTargetId);
        setScene({
          id: Date.now(),
          kind: "REWARD",
          name:
            item?.name ??
            (day.rewardType === "CURRENCY"
              ? `${day.rewardAmount.toLocaleString()} 크레딧`
              : "출석 보상"),
          imageUrl: item?.imageUrl,
        });
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "출석 보상을 받을 수 없어요.",
        );
    } finally {
      claiming.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const today = data?.definitions.find((d) => d.state === "AVAILABLE"),
    claimed =
      data?.definitions.filter((d) => d.state === "CLAIMED").length ?? 0;
  const claimedToday = Boolean(
    data?.claims?.some((c) => c.claimDate === data.today),
  );
  const allClaimed = Boolean(
    data?.definitions.length &&
    data.definitions.every((d) => d.state === "CLAIMED"),
  );
  const settledLabel = claimedToday
    ? "오늘 출석 완료"
    : allClaimed
      ? "모든 출석 보상 수령 완료"
      : "지금 받을 수 있는 보상이 없어요";
  return (
    <main className="ko-experience-page ko-player-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="ATTENDANCE"
          title="출석 보드"
          description="하루 한 번, 다음 경기를 위한 작은 선물."
          links={REWARD_PAGE_LINKS}
          aside={
            <div className="ko-surface-stat">
              <strong>
                {data ? claimed : "—"}
                <small> / {data?.definitions.length ?? "—"}</small>
              </strong>
              <span>누적 수령</span>
            </div>
          }
        />
        <ClaimAllRewardsButton disabled={busy}/>
        {error && (
          <div className="ko-surface-message is-error" role="alert">
            {error}
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              다시 확인
            </button>
          </div>
        )}
        {message && (
          <p className="ko-surface-message" role="status">
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
        {loading && !data ? (
          <SurfaceEmpty title="출석 보드를 준비하고 있어요">
            오늘의 출석 상태를 확인하고 있어요.
          </SurfaceEmpty>
        ) : data && data.definitions.length > 0 ? (
          <>
            <section className="ko-reward-today" aria-label="오늘의 출석 보상">
              <div className="ko-reward-today__copy">
                <p>
                  {today
                    ? `DAY ${today.dayIndex} / 오늘 받을 수 있어요`
                    : claimedToday
                      ? "오늘의 출석을 확인했어요"
                      : "출석 보상 현황"}
                </p>
                {today ? (
                  <RewardDisplay reward={today} catalog={catalog} large />
                ) : (
                  <div className="flex items-center gap-4">
                    {claimedToday || allClaimed ? (
                      <CalendarCheck2 size={32} className="text-amber-200" />
                    ) : (
                      <LockKeyhole size={30} className="text-amber-200" />
                    )}
                    <h2 className="text-xl">{settledLabel}</h2>
                  </div>
                )}
              </div>
              <div className="ko-reward-today__action">
                <p>
                  {data.today}
                  {today
                    ? " · 오늘 받을 보상을 먼저 챙기세요."
                    : claimedToday
                      ? " · 다음 출석 보상도 이곳에서 확인하세요."
                      : " · 등록된 보상과 수령 상태를 확인하세요."}
                </p>
                <button
                  type="button"
                  className="ko-surface-primary"
                  disabled={busy || loading || !today}
                  onClick={() => void claim()}
                >
                  {busy ? (
                    "보상 확인 중…"
                  ) : today ? (
                    "오늘 출석하고 보상 받기"
                  ) : (
                    <>
                      {claimedToday || allClaimed ? (
                        <Check size={16} />
                      ) : (
                        <LockKeyhole size={16} />
                      )}
                      {settledLabel}
                    </>
                  )}
                </button>
              </div>
            </section>
            <div className="ko-reward-section-title">
              <h2>이어지는 출석 여정</h2>
              <span>보상은 등록된 순서대로 표시돼요</span>
            </div>
            <div className="ko-attendance-track">
              {data.definitions.map((day) => (
                <article
                  key={day.dayIndex}
                  className="ko-attendance-day"
                  data-state={day.state}
                  aria-label={`${day.dayIndex}일차 · ${day.state === "CLAIMED" ? "수령 완료" : day.state === "AVAILABLE" ? "오늘 수령 가능" : "다음 보상"}`}
                >
                  <div className="ko-attendance-day__number">
                    <span>DAY</span>
                    <strong>{String(day.dayIndex).padStart(2, "0")}</strong>
                  </div>
                  <RewardDisplay reward={day} catalog={catalog} />
                  <p className="ko-attendance-day__state">
                    {day.state === "CLAIMED" ? (
                      <>
                        <Check size={12} />
                        수령 완료
                      </>
                    ) : day.state === "AVAILABLE" ? (
                      "오늘의 보상"
                    ) : (
                      <>
                        <LockKeyhole size={11} />
                        다음 보상
                      </>
                    )}
                  </p>
                </article>
              ))}
            </div>
            <p className="ko-reward-footnote">
              수령 가능한 보상은 ‘오늘의 보상’으로 표시돼요. 이미 받은 보상은
              다시 지급되지 않아요.
            </p>
          </>
        ) : (
          !error && (
            <SurfaceEmpty
              title="출석 보상을 준비 중이에요"
              href="/daily-quests"
              label="퀘스트 보러 가기"
            >
              등록된 보상이 생기면 이곳에서 확인할 수 있어요.
            </SurfaceEmpty>
          )
        )}
      </div>
      {scene && (
        <CollectionActionAnimation
          scene={scene}
          onComplete={() => setScene(null)}
        />
      )}
    </main>
  );
}

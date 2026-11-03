import {
  isTestAccountUser,
  TEST_ACCOUNT_UNLIMITED_BALANCE,
} from "./test-account";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  attendanceRewardDefinitionsTable,
  attendanceClaimsTable,
  usersTable,
  packDefinitionsTable,
  cardsTable,
  championsTable,
} from "@workspace/db";
import {
  ensureAllQuestAssignments,
  claimDailyQuest,
  questSettings,
  dailyDate,
} from "./daily-quest-service";
import { ensureDraftParticipationQuest } from "./draft-participation-quest";
import { readPlatform } from "./quest-platform";
import {
  dailyCompletionBonus,
  claimDailyCompletionBonus,
} from "./daily-completion-bonus";
import { publicAttendance, claimAttendance } from "./attendance-service";
import { tutorialRewardStatus, claimTutorialReward } from "./tutorial-rewards";
import { replayTutorial } from "./tutorial-replay";
import { rewardTutorialCatalog } from "./tutorial-catalog";
import { LESSONS } from "@workspace/game-engine";
import type { RewardGrantResult } from "./reward-service";

type Kind = "QUEST" | "DAILY_BONUS" | "ATTENDANCE" | "TUTORIAL";
type Reward = {
  rewardType: string;
  rewardAmount: number;
  rewardTargetId: string | null;
};
export type AvailableReward = {
  id: string;
  kind: Kind;
  label: string;
  rewards: Reward[];
};
export type RewardIssue = {
  id: string;
  kind: Kind;
  label: string;
  message: string;
};
const labels: Record<Kind, string> = {
  QUEST: "퀘스트",
  DAILY_BONUS: "일일 완료 추가 보상",
  ATTENDANCE: "출석",
  TUTORIAL: "튜토리얼",
};
function safeIssue(kind: Kind, id: string, label = labels[kind]): RewardIssue {
  return {
    kind,
    id,
    label,
    message: `${label} 보상을 확인하지 못했어요. 다른 보상은 처리되며, 이 항목은 다시 확인할 수 있어요.`,
  };
}
async function balances(userId: string) {
  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return null;
  const unlimited = isTestAccountUser(u);
  return {
    currencyBalance: unlimited
      ? TEST_ACCOUNT_UNLIMITED_BALANCE
      : u.currencyBalance,
    prismBalance: unlimited ? TEST_ACCOUNT_UNLIMITED_BALANCE : u.prismBalance,
    championPrismBalance: unlimited
      ? TEST_ACCOUNT_UNLIMITED_BALANCE
      : u.championPrismBalance,
    isTestAccount: unlimited,
  };
}
/** Discover exactly the same available periods and prerequisites as the individual pages. */
export async function availableAccountRewards(userId: string) {
  const items: AvailableReward[] = [],
    issues: RewardIssue[] = [];
  let tutorialClaimed: string[] = [];
  await Promise.all([
    (async () => {
      try {
        const assigned = await ensureAllQuestAssignments(userId),
          draft = await ensureDraftParticipationQuest(userId);
        for (const q of [...assigned, ...(draft ? [draft] : [])])
          if (q.status === "COMPLETED" && q.progress >= q.targetValue)
            items.push({
              id: q.id,
              kind: "QUEST",
              label: q.title,
              rewards: readPlatform(q).rewards,
            });
        const settings = await questSettings();
        const bonus = await dailyCompletionBonus(
          userId,
          assigned,
          dailyDate(new Date(), settings.timezone),
        );
        if (bonus.status === "COMPLETED")
          items.push({
            id: bonus.date,
            kind: "DAILY_BONUS",
            label: labels.DAILY_BONUS,
            rewards: [
              {
                rewardType: bonus.rewardType,
                rewardAmount: bonus.rewardAmount,
                rewardTargetId: bonus.rewardTargetId,
              },
            ],
          });
      } catch {
        issues.push(safeIssue("QUEST", "quest-status"));
      }
    })(),
    (async () => {
      try {
        const [definitions, claims] = await Promise.all([
          db
            .select()
            .from(attendanceRewardDefinitionsTable)
            .orderBy(asc(attendanceRewardDefinitionsTable.dayIndex)),
          db
            .select()
            .from(attendanceClaimsTable)
            .where(eq(attendanceClaimsTable.userId, userId)),
        ]);
        const status = publicAttendance(definitions, claims),
          day = status.definitions.find((d) => d.state === "AVAILABLE");
        if (day)
          items.push({
            id: String(day.dayIndex),
            kind: "ATTENDANCE",
            label: `출석 ${day.dayIndex}일차`,
            rewards: [
              {
                rewardType: day.rewardType,
                rewardAmount: day.rewardAmount,
                rewardTargetId: day.rewardTargetId,
              },
            ],
          });
      } catch {
        issues.push(safeIssue("ATTENDANCE", "attendance-status"));
      }
    })(),
    (async () => {
      try {
        const s = await tutorialRewardStatus(userId);
        tutorialClaimed = s.lessons.filter((l) => l.claimed).map((l) => l.id);
      } catch {
        issues.push(safeIssue("TUTORIAL", "tutorial-status"));
      }
    })(),
  ]);
  let accountBalances: Awaited<ReturnType<typeof balances>> = null;
  try {
    accountBalances = await balances(userId);
  } catch {}
  const order: Record<Kind, number> = {
    QUEST: 0,
    DAILY_BONUS: 1,
    ATTENDANCE: 2,
    TUTORIAL: 3,
  };
  items.sort(
    (a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id),
  );
  return {
    accountId: userId,
    items,
    issues,
    tutorialClaimed,
    balances: accountBalances,
  };
}

/** Each source keeps its existing transaction/receipt, so one bad reward cannot roll back good ones. */
export async function claimAllAccountRewards(
  userId: string,
  proofs: unknown[],
) {
  const available = await availableAccountRewards(userId);
  const results: Array<
    AvailableReward & {
      status: "CLAIMED" | "ALREADY_CLAIMED" | "FAILED";
      grants: RewardGrantResult[];
      message?: string;
    }
  > = [];
  const process = async (
    item: AvailableReward,
    claim: () => Promise<RewardGrantResult[]>,
  ) => {
    try {
      const grants = await claim();
      results.push({
        ...item,
        status: grants.some((g) => g.granted) ? "CLAIMED" : "ALREADY_CLAIMED",
        grants,
      });
    } catch {
      results.push({
        ...item,
        status: "FAILED",
        grants: [],
        message: safeIssue(item.kind, item.id, item.label).message,
      });
    }
  };
  for (const item of available.items)
    await process(item, async () => {
      if (item.kind === "QUEST")
        return (await claimDailyQuest(userId, item.id)).rewards;
      if (item.kind === "DAILY_BONUS") {
        const r = await claimDailyCompletionBonus(userId);
        return r.reward ? [r.reward] : [];
      }
      const r = await claimAttendance(userId);
      return r.reward ? [r.reward] : [];
    });
  const seen = new Set<string>();
  for (const raw of proofs) {
    const requested = raw as { lessonId?: unknown } | null;
    const lesson = LESSONS.find((l) => l.id === requested?.lessonId);
    if (lesson && seen.has(lesson.id)) continue;
    if (lesson) seen.add(lesson.id);
    const item: AvailableReward = {
      kind: "TUTORIAL",
      id: lesson?.id ?? "invalid-proof",
      label: lesson ? `튜토리얼 · ${lesson.title}` : labels.TUTORIAL,
      rewards: [],
    };
    await process(item, async () => {
      const proof = replayTutorial(raw, rewardTutorialCatalog);
      const r = await claimTutorialReward(userId, proof.lessonId);
      return [r.lesson, ...(r.all ? [r.all] : [])];
    });
  }
  const totals: Reward[] = [];
  for (const r of results)
    for (const grant of r.grants.filter((g) => g.granted)) {
      const target = grant.rewardTargetId ?? null;
      const existing = totals.find(
        (t) => t.rewardType === grant.rewardType && t.rewardTargetId === target,
      );
      if (existing) existing.rewardAmount += grant.amount;
      else
        totals.push({
          rewardType: grant.rewardType,
          rewardTargetId: target,
          rewardAmount: grant.amount,
        });
    }
  const names = new Map<string, string>();
  for (const [type, table] of [
    ["PACK", packDefinitionsTable],
    ["CARD", cardsTable],
    ["CHAMPION", championsTable],
  ] as const) {
    const ids = totals
      .filter((t) => t.rewardType === type && t.rewardTargetId)
      .map((t) => t.rewardTargetId!);
    if (ids.length)
      try {
        const rows = await db
          .select({ id: table.id, name: table.name })
          .from(table)
          .where(inArray(table.id, ids));
        for (const row of rows) names.set(type + ":" + row.id, row.name);
      } catch {}
  }
  const namedTotals = totals.map((t) => ({
    ...t,
    label:
      t.rewardType === "CURRENCY"
        ? "크레딧"
        : (names.get(t.rewardType + ":" + t.rewardTargetId) ??
          { PACK: "팩 보상", CARD: "카드 보상", CHAMPION: "챔피언 보상" }[
            t.rewardType as "PACK"
          ] ??
          "보상"),
  }));
  let accountBalances: Awaited<ReturnType<typeof balances>> = null;
  try {
    accountBalances = await balances(userId);
  } catch {}
  return {
    accountId: userId,
    items: results,
    issues: available.issues,
    totals: namedTotals,
    claimedCount: results.filter((r) => r.status === "CLAIMED").length,
    failedCount:
      results.filter((r) => r.status === "FAILED").length +
      available.issues.length,
    balances: accountBalances,
  };
}

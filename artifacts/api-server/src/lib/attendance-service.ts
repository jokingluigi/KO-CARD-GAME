import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  attendanceClaimsTable,
  attendanceRewardDefinitionsTable,
  db,
  type AttendanceClaimRecord,
  type AttendanceRewardDefinitionRecord,
} from "@workspace/db";
import { dailyDate } from "./daily-quest-service";
import { grantReward, isRewardType } from "./reward-service";

export function nextAttendanceDayIndex(claimedDayIndexes: number[]): number {
  return (
    (claimedDayIndexes.length > 0 ? Math.max(...claimedDayIndexes) : 0) + 1
  );
}

/** A cycle advances only after its last configured, enabled reward. Old claims are cycle 1. */
export function attendancePosition(
  definitions: Pick<AttendanceRewardDefinitionRecord, "dayIndex" | "enabled">[],
  claims: Array<{ dayIndex: number; cycle?: number; claimDate: string }>,
  today: string,
) {
  const enabled = definitions
    .filter((d) => d.enabled)
    .sort((a, b) => a.dayIndex - b.dayIndex);
  const currentCycle = Math.max(1, ...claims.map((c) => c.cycle ?? 1));
  const current = claims.filter((c) => (c.cycle ?? 1) === currentCycle);
  const lastDay = Math.max(0, ...current.map((c) => c.dayIndex));
  const next = enabled.find((d) => d.dayIndex > lastDay);
  const todayClaim = claims.find((c) => c.claimDate === today);
  const wrapped = !next && enabled.length > 0 && current.length > 0;
  const nextCycle = wrapped ? currentCycle + 1 : currentCycle;
  // Keep the just-completed track visible for the rest of the claim date.
  const displayCycle = todayClaim?.cycle ?? (todayClaim ? 1 : nextCycle);
  return {
    cycle: nextCycle,
    displayCycle,
    nextDayIndex: (next ?? enabled[0])?.dayIndex ?? null,
    claimedDaySet: new Set(
      claims
        .filter((c) => (c.cycle ?? 1) === displayCycle)
        .map((c) => c.dayIndex),
    ),
    alreadyClaimedToday: Boolean(todayClaim),
  };
}

export async function claimAttendance(userId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"attendance:" + userId}))`,
    );
    const today = dailyDate(now);
    const [todayClaim] = await tx
      .select()
      .from(attendanceClaimsTable)
      .where(
        and(
          eq(attendanceClaimsTable.userId, userId),
          eq(attendanceClaimsTable.claimDate, today),
        ),
      )
      .limit(1);
    if (todayClaim)
      return { claim: todayClaim, reward: null, alreadyClaimed: true };

    const [definitions, claims] = await Promise.all([
      tx.select().from(attendanceRewardDefinitionsTable),
      tx
        .select()
        .from(attendanceClaimsTable)
        .where(eq(attendanceClaimsTable.userId, userId)),
    ]);
    const position = attendancePosition(definitions, claims, today);
    const definition = definitions.find(
      (d) => d.enabled && d.dayIndex === position.nextDayIndex,
    );
    if (!definition) throw new Error("현재 받을 수 있는 출석 보상이 없습니다.");

    const claimId = randomUUID();
    const [claim] = await tx
      .insert(attendanceClaimsTable)
      .values({
        id: claimId,
        userId,
        claimDate: today,
        cycle: position.cycle,
        dayIndex: definition.dayIndex,
        rewardType: definition.rewardType,
        rewardAmount: definition.rewardAmount,
        rewardTargetId: definition.rewardTargetId,
      })
      .onConflictDoNothing()
      .returning();
    if (!claim) {
      const [existing] = await tx
        .select()
        .from(attendanceClaimsTable)
        .where(
          and(
            eq(attendanceClaimsTable.userId, userId),
            eq(attendanceClaimsTable.claimDate, today),
          ),
        )
        .limit(1);
      if (!existing)
        throw new Error("출석 상태가 변경되었습니다. 다시 확인해 주세요.");
      return { claim: existing, reward: null, alreadyClaimed: true };
    }
    const reward = await grantReward(
      {
        userId,
        sourceType: "ATTENDANCE_CLAIM",
        sourceId: claim.id,
        rewardType: claim.rewardType,
        amount: claim.rewardAmount,
        rewardTargetId: claim.rewardTargetId,
        metadata: {
          claimDate: claim.claimDate,
          cycle: claim.cycle,
          dayIndex: claim.dayIndex,
        },
      },
      tx,
    );
    return { claim, reward, alreadyClaimed: false };
  });
}

export function validateAttendanceInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const dayIndex =
    typeof input.dayIndex === "number" ? input.dayIndex : Number.NaN;
  const rewardType = input.rewardType ?? "CURRENCY";
  const rewardTargetId =
    typeof input.rewardTargetId === "string" && input.rewardTargetId.trim()
      ? input.rewardTargetId.trim()
      : null;
  const rewardAmount =
    typeof input.rewardAmount === "number" ? input.rewardAmount : Number.NaN;
  const enabled = input.enabled !== false;
  if (
    !Number.isSafeInteger(dayIndex) ||
    dayIndex < 1 ||
    dayIndex > 365 ||
    !isRewardType(rewardType) ||
    (rewardType === "CURRENCY" && rewardTargetId !== null) ||
    (rewardType !== "CURRENCY" && rewardTargetId === null) ||
    !Number.isSafeInteger(rewardAmount) ||
    rewardAmount < 1 ||
    rewardAmount > 2_147_483_647
  )
    return null;
  return { dayIndex, rewardType, rewardAmount, rewardTargetId, enabled };
}

export function publicAttendance(
  definitions: AttendanceRewardDefinitionRecord[],
  claims: AttendanceClaimRecord[],
  now = new Date(),
) {
  const today = dailyDate(now);
  const { claimedDaySet, alreadyClaimedToday, nextDayIndex, displayCycle } =
    attendancePosition(definitions, claims, today);
  return {
    today,
    nextDayIndex,
    cycle: displayCycle,
    repeats: true,
    definitions: definitions.map((definition) => ({
      dayIndex: definition.dayIndex,
      rewardType: definition.rewardType,
      rewardAmount: definition.rewardAmount,
      rewardTargetId: definition.rewardTargetId,
      enabled: definition.enabled,
      state: claimedDaySet.has(definition.dayIndex)
        ? "CLAIMED"
        : !alreadyClaimedToday &&
            definition.dayIndex === nextDayIndex &&
            definition.enabled
          ? "AVAILABLE"
          : "LOCKED",
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      cycle: claim.cycle,
      claimDate: claim.claimDate,
      dayIndex: claim.dayIndex,
      rewardType: claim.rewardType,
      rewardAmount: claim.rewardAmount,
      rewardTargetId: claim.rewardTargetId,
      claimedAt: claim.claimedAt,
    })),
  };
}

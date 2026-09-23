import { and, asc, desc, eq } from "drizzle-orm";
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
  return (claimedDayIndexes.length > 0 ? Math.max(...claimedDayIndexes) : 0) + 1;
}

export async function attendanceSnapshot(userId: string) {
  const [definitions, claims] = await Promise.all([
    db.select().from(attendanceRewardDefinitionsTable).orderBy(asc(attendanceRewardDefinitionsTable.dayIndex)),
    db.select().from(attendanceClaimsTable)
      .where(eq(attendanceClaimsTable.userId, userId))
      .orderBy(asc(attendanceClaimsTable.dayIndex)),
  ]);
  const today = dailyDate();
  const claimedDaySet = new Set(claims.map((claim) => claim.dayIndex));
  const nextDayIndex = nextAttendanceDayIndex(claims.map((claim) => claim.dayIndex));
  return {
    today,
    nextDayIndex,
    definitions,
    claims,
    claimedDaySet,
  };
}

export async function claimAttendance(userId: string) {
  return db.transaction(async (tx) => {
    const today = dailyDate();
    const [todayClaim] = await tx.select().from(attendanceClaimsTable)
      .where(and(eq(attendanceClaimsTable.userId, userId), eq(attendanceClaimsTable.claimDate, today)))
      .limit(1);
    if (todayClaim) return { claim: todayClaim, reward: null, alreadyClaimed: true };

    const [lastClaim] = await tx.select({ dayIndex: attendanceClaimsTable.dayIndex })
      .from(attendanceClaimsTable)
      .where(eq(attendanceClaimsTable.userId, userId))
      .orderBy(desc(attendanceClaimsTable.dayIndex))
      .limit(1);
    const nextDayIndex = nextAttendanceDayIndex(lastClaim ? [lastClaim.dayIndex] : []);
    const [definition] = await tx.select().from(attendanceRewardDefinitionsTable)
      .where(and(
        eq(attendanceRewardDefinitionsTable.dayIndex, nextDayIndex),
        eq(attendanceRewardDefinitionsTable.enabled, true),
      ))
      .limit(1);
    if (!definition) throw new Error("현재 받을 수 있는 출석 보상이 없습니다.");

    const claimId = randomUUID();
    const [claim] = await tx.insert(attendanceClaimsTable)
      .values({
        id: claimId,
        userId,
        claimDate: today,
        dayIndex: definition.dayIndex,
        rewardType: definition.rewardType,
        rewardAmount: definition.rewardAmount,
        rewardTargetId: definition.rewardTargetId,
      })
      .onConflictDoNothing()
      .returning();
    if (!claim) {
      const [existing] = await tx.select().from(attendanceClaimsTable)
        .where(and(eq(attendanceClaimsTable.userId, userId), eq(attendanceClaimsTable.claimDate, today)))
        .limit(1);
      return { claim: existing, reward: null, alreadyClaimed: true };
    }
    const reward = await grantReward({
      userId,
      sourceType: "ATTENDANCE_CLAIM",
      sourceId: claim.id,
      rewardType: claim.rewardType,
      amount: claim.rewardAmount,
      rewardTargetId: claim.rewardTargetId,
      metadata: { claimDate: claim.claimDate, dayIndex: claim.dayIndex },
    }, tx);
    return { claim, reward, alreadyClaimed: false };
  });
}

export function validateAttendanceInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const dayIndex = typeof input.dayIndex === "number" ? input.dayIndex : Number.NaN;
  const rewardType = input.rewardType ?? "CURRENCY";
  const rewardTargetId = typeof input.rewardTargetId === "string" && input.rewardTargetId.trim()
    ? input.rewardTargetId.trim()
    : null;
  const rewardAmount = typeof input.rewardAmount === "number" ? input.rewardAmount : Number.NaN;
  const enabled = input.enabled !== false;
  if (
    !Number.isSafeInteger(dayIndex) || dayIndex < 1 || dayIndex > 365 ||
    !isRewardType(rewardType) ||
    (rewardType === "CURRENCY" && rewardTargetId !== null) ||
    (rewardType !== "CURRENCY" && rewardTargetId === null) ||
    !Number.isSafeInteger(rewardAmount) || rewardAmount < 1 || rewardAmount > 2_147_483_647
  ) return null;
  return { dayIndex, rewardType, rewardAmount, rewardTargetId, enabled };
}

export function publicAttendance(
  definitions: AttendanceRewardDefinitionRecord[],
  claims: AttendanceClaimRecord[],
) {
  const today = dailyDate();
  const claimedDaySet = new Set(claims.map((claim) => claim.dayIndex));
  const nextDayIndex = (claims.at(-1)?.dayIndex ?? 0) + 1;
  return {
    today,
    nextDayIndex,
    definitions: definitions.map((definition) => ({
      dayIndex: definition.dayIndex,
      rewardType: definition.rewardType,
      rewardAmount: definition.rewardAmount,
      rewardTargetId: definition.rewardTargetId,
      enabled: definition.enabled,
      state: claimedDaySet.has(definition.dayIndex)
        ? "CLAIMED"
        : definition.dayIndex === nextDayIndex && definition.enabled
          ? "AVAILABLE"
          : "LOCKED",
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      claimDate: claim.claimDate,
      dayIndex: claim.dayIndex,
      rewardType: claim.rewardType,
      rewardAmount: claim.rewardAmount,
      rewardTargetId: claim.rewardTargetId,
      claimedAt: claim.claimedAt,
    })),
  };
}
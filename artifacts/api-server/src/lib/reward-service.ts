import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  currencyTransactionsTable,
  db,
  rewardGrantsTable,
  rewardSettingsTable,
  usersTable,
} from "@workspace/db";
import { isTestAccountUser, TEST_ACCOUNT_UNLIMITED_BALANCE } from "./test-account";
import { SHOP_CURRENCY } from "./shop-currency";

export const REWARD_TYPE = "CURRENCY" as const;
export type RewardExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type RewardGrant = {
  userId: string;
  sourceType: string;
  sourceId: string;
  rewardType: string;
  amount: number;
  metadata?: Record<string, unknown>;
};

export type RewardGrantResult = {
  granted: boolean;
  amount: number;
  rewardType: string;
  balanceAfter: number;
  idempotencyKey: string;
};

export function rewardIdempotencyKey(grant: Pick<RewardGrant, "sourceType" | "sourceId" | "userId" | "rewardType">): string {
  return `${grant.sourceType}:${grant.sourceId}:${grant.userId}:${grant.rewardType}`;
}

export function isFinishedMatchRewardEligible(
  status: string,
  winnerUserId: string | null,
  resultReason: string | null,
): boolean {
  return status === "FINISHED" &&
    Boolean(winnerUserId) &&
    !["ABORTED", "CANCELLED", "SERVER_ERROR"].includes(resultReason ?? "");
}

export async function findRewardSetting(key: string, executor: RewardExecutor = db) {
  const [setting] = await executor.select().from(rewardSettingsTable)
    .where(eq(rewardSettingsTable.key, key))
    .limit(1);
  return setting ?? null;
}

export async function grantReward(
  grant: RewardGrant,
  executor: RewardExecutor,
): Promise<RewardGrantResult> {
  if (!Number.isSafeInteger(grant.amount) || grant.amount < 1) {
    throw new Error("보상 설정이 유효하지 않습니다.");
  }
  if (grant.rewardType !== REWARD_TYPE) {
    throw new Error("지원하지 않는 보상 종류입니다.");
  }

  const idempotencyKey = rewardIdempotencyKey(grant);
  const [reservation] = await executor.insert(rewardGrantsTable)
    .values({
      id: randomUUID(),
      idempotencyKey,
      userId: grant.userId,
      sourceType: grant.sourceType,
      sourceId: grant.sourceId,
      rewardType: grant.rewardType,
      amount: grant.amount,
      balanceAfter: 0,
      metadata: grant.metadata ?? {},
    })
    .onConflictDoNothing({ target: rewardGrantsTable.idempotencyKey })
    .returning({ id: rewardGrantsTable.id });

  if (!reservation) {
    const [existing] = await executor.select({
      amount: rewardGrantsTable.amount,
      rewardType: rewardGrantsTable.rewardType,
      balanceAfter: rewardGrantsTable.balanceAfter,
    }).from(rewardGrantsTable)
      .where(eq(rewardGrantsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    return {
      granted: false,
      amount: existing?.amount ?? grant.amount,
      rewardType: existing?.rewardType ?? grant.rewardType,
      balanceAfter: existing?.balanceAfter ?? 0,
      idempotencyKey,
    };
  }

  const [user] = await executor.select().from(usersTable)
    .where(eq(usersTable.id, grant.userId))
    .limit(1);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");

  let balanceAfter = user.currencyBalance;
  if (!isTestAccountUser(user)) {
    const [updated] = await executor.update(usersTable)
      .set({
        currencyBalance: sql`${usersTable.currencyBalance} + ${grant.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, grant.userId))
      .returning({ currencyBalance: usersTable.currencyBalance });
    if (!updated) throw new Error("보상 잔액을 갱신하지 못했습니다.");
    balanceAfter = updated.currencyBalance;
  } else {
    balanceAfter = TEST_ACCOUNT_UNLIMITED_BALANCE;
  }

  await executor.update(rewardGrantsTable)
    .set({ balanceAfter })
    .where(eq(rewardGrantsTable.id, reservation.id));
  await executor.insert(currencyTransactionsTable).values({
    id: randomUUID(),
    userId: grant.userId,
    amount: grant.amount,
    balanceAfter,
    currencyType: SHOP_CURRENCY,
    type: grant.sourceType,
    metadata: grant.metadata ?? {},
  });

  return {
    granted: true,
    amount: grant.amount,
    rewardType: grant.rewardType,
    balanceAfter,
    idempotencyKey,
  };
}
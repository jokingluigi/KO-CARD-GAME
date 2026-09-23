import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  cardsTable,
  packDefinitionsTable,
  currencyTransactionsTable,
  db,
  rewardGrantsTable,
  rewardSettingsTable,
  userCardCollectionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import { isTestAccountUser, TEST_ACCOUNT_UNLIMITED_BALANCE } from "./test-account";
import { SHOP_CURRENCY } from "./shop-currency";

export const REWARD_TYPES = ["CURRENCY", "CARD", "PACK"] as const;
export type RewardType = (typeof REWARD_TYPES)[number];
export const REWARD_TYPE = "CURRENCY" as const;
export type RewardExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type RewardGrant = {
  userId: string;
  sourceType: string;
  sourceId: string;
  rewardType: string;
  amount: number;
  rewardTargetId?: string | null;
  metadata?: Record<string, unknown>;
};

export type RewardGrantResult = {
  granted: boolean;
  amount: number;
  rewardType: string;
  balanceAfter: number;
  rewardTargetId: string | null;
  idempotencyKey: string;
};

export function rewardIdempotencyKey(grant: Pick<RewardGrant, "sourceType" | "sourceId" | "userId" | "rewardType">): string {
  return `${grant.sourceType}:${grant.sourceId}:${grant.userId}:${grant.rewardType}`;
}

export function isRewardType(value: unknown): value is RewardType {
  return typeof value === "string" && (REWARD_TYPES as readonly string[]).includes(value);
}

export async function validateRewardTarget(
  rewardType: string,
  rewardTargetId: string | null | undefined,
  executor: RewardExecutor = db,
): Promise<boolean> {
  if (rewardType === "CURRENCY") return !rewardTargetId;
  if (!rewardTargetId || !isRewardType(rewardType)) return false;
  if (rewardType === "CARD") {
    const [card] = await executor.select({ id: cardsTable.id }).from(cardsTable)
      .where(and(
        eq(cardsTable.id, rewardTargetId),
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      ))
      .limit(1);
    return Boolean(card);
  }
  const [pack] = await executor.select({ id: packDefinitionsTable.id }).from(packDefinitionsTable)
    .where(and(
      eq(packDefinitionsTable.id, rewardTargetId),
      eq(packDefinitionsTable.status, "PUBLISHED"),
      sql`${packDefinitionsTable.deletedAt} IS NULL`,
    ))
    .limit(1);
  return Boolean(pack);
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
  if (!isRewardType(grant.rewardType)) {
    throw new Error("지원하지 않는 보상 종류입니다.");
  }
  if (!(await validateRewardTarget(grant.rewardType, grant.rewardTargetId, executor))) {
    throw new Error("보상 대상이 유효하지 않습니다.");
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
      rewardTargetId: grant.rewardTargetId ?? null,
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
      rewardTargetId: grant.rewardTargetId ?? null,
      idempotencyKey,
    };
  }

  const [user] = await executor.select().from(usersTable)
    .where(eq(usersTable.id, grant.userId))
    .limit(1);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");

  let balanceAfter = user.currencyBalance;
  if (grant.rewardType === "CURRENCY") {
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
    await executor.insert(currencyTransactionsTable).values({
      id: randomUUID(),
      userId: grant.userId,
      amount: grant.amount,
      balanceAfter,
      currencyType: SHOP_CURRENCY,
      type: grant.sourceType,
      metadata: grant.metadata ?? {},
    });
  } else if (grant.rewardType === "CARD") {
    await executor.insert(userCardCollectionsTable).values({
      userId: grant.userId,
      cardDefinitionId: grant.rewardTargetId!,
      quantity: grant.amount,
    }).onConflictDoUpdate({
      target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
      set: {
        quantity: sql`${userCardCollectionsTable.quantity} + ${grant.amount}`,
      },
    });
  } else {
    await executor.insert(userPackInventoryTable).values({
      userId: grant.userId,
      packDefinitionId: grant.rewardTargetId!,
      quantity: grant.amount,
    }).onConflictDoUpdate({
      target: [userPackInventoryTable.userId, userPackInventoryTable.packDefinitionId],
      set: {
        quantity: sql`${userPackInventoryTable.quantity} + ${grant.amount}`,
        updatedAt: new Date(),
      },
    });
  }

  await executor.update(rewardGrantsTable)
    .set({ balanceAfter })
    .where(eq(rewardGrantsTable.id, reservation.id));
  return {
    granted: true,
    amount: grant.amount,
    rewardType: grant.rewardType,
    balanceAfter,
    rewardTargetId: grant.rewardTargetId ?? null,
    idempotencyKey,
  };
}
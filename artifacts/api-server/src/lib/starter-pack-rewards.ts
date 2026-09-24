import { asc, sql } from "drizzle-orm";
import { packDefinitionsTable } from "@workspace/db";
import { grantReward, validateRewardTarget, type RewardExecutor, type RewardGrantResult } from "./reward-service";

const STARTER_PACK_SOURCE_TYPE = "ACCOUNT_SIGNUP_STARTER_PACK";
const MAX_STARTER_PACK_QUANTITY = 999;

export class StarterPackConfigurationError extends Error {
  constructor() {
    super("신규 계정 팩 보상이 올바르게 설정되지 않았습니다.");
    this.name = "StarterPackConfigurationError";
  }
}

export async function grantAccountStarterPacks(
  userId: string,
  executor: RewardExecutor,
): Promise<RewardGrantResult[]> {
  const configuredPacks = await executor
    .select({
      id: packDefinitionsTable.id,
      quantity: packDefinitionsTable.starterRewardQuantity,
      status: packDefinitionsTable.status,
      deletedAt: packDefinitionsTable.deletedAt,
    })
    .from(packDefinitionsTable)
    .where(sql`${packDefinitionsTable.starterRewardQuantity} <> 0`)
    .orderBy(asc(packDefinitionsTable.id));

  if (configuredPacks.length === 0) {
    throw new StarterPackConfigurationError();
  }

  for (const pack of configuredPacks) {
    if (
      !Number.isSafeInteger(pack.quantity) ||
      pack.quantity < 1 ||
      pack.quantity > MAX_STARTER_PACK_QUANTITY ||
      pack.status !== "PUBLISHED" ||
      pack.deletedAt !== null ||
      !(await validateRewardTarget("PACK", pack.id, executor))
    ) {
      throw new StarterPackConfigurationError();
    }
  }

  const grants: RewardGrantResult[] = [];
  for (const pack of configuredPacks) {
    try {
      grants.push(await grantReward({
        userId,
        sourceType: STARTER_PACK_SOURCE_TYPE,
        sourceId: pack.id,
        rewardType: "PACK",
        amount: pack.quantity,
        rewardTargetId: pack.id,
        metadata: {
          source: "account_signup",
          packDefinitionId: pack.id,
        },
      }, executor));
    } catch (error) {
      if (error instanceof Error && error.message === "보상 대상이 유효하지 않습니다.") {
        throw new StarterPackConfigurationError();
      }
      throw error;
    }
  }

  return grants;
}
export const MAX_BULK_PACK_QUANTITY = 100;

export type PackOpenMode = "single" | "bulk";
export type PackOpenings = Array<{ rewards: Array<Record<string, unknown>> }>;

const BULK_CLAIM_MARKER = "__packBulkOpening";
const VALID_REWARD_TYPES = new Set(["NORMAL_CARD", "LEGENDARY_CARD", "CHAMPION_UNLOCK", "SKIN"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidStoredReward(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.rewardType !== "string" || !VALID_REWARD_TYPES.has(value.rewardType)) {
    return false;
  }

  if (value.rewardType === "NORMAL_CARD" || value.rewardType === "LEGENDARY_CARD") {
    return isNonEmptyString(value.cardDefinitionId) && isRecord(value.card);
  }
  if (value.rewardType === "CHAMPION_UNLOCK") {
    return isNonEmptyString(value.championDefinitionId)
      && isRecord(value.champion)
      && typeof value.alreadyOwned === "boolean"
      && (value.championPrismReward === undefined
        || (Number.isInteger(value.championPrismReward) && (value.championPrismReward as number) >= 0));
  }
  return isNonEmptyString(value.skinDefinitionId)
    && isRecord(value.skin)
    && isRecord(value.card)
    && typeof value.alreadyOwned === "boolean";
}

function isValidBulkOpenings(value: unknown, quantity: number): value is PackOpenings {
  return Array.isArray(value)
    && value.length === quantity
    && value.every((opening) => isRecord(opening)
      && Array.isArray(opening.rewards)
      && opening.rewards.every(isValidStoredReward));
}

export function parseBulkPackQuantity(value: unknown): number | null {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_BULK_PACK_QUANTITY) {
    return null;
  }
  return value as number;
}

export async function rollPackOpenings<T>(
  quantity: number,
  rollPack: () => Promise<T[]>,
): Promise<Array<{ rewards: T[] }>> {
  const openings: Array<{ rewards: T[] }> = [];
  for (let index = 0; index < quantity; index += 1) {
    openings.push({ rewards: await rollPack() });
  }
  return openings;
}

export function encodeBulkClaim(openings: PackOpenings, quantity: number): Array<Record<string, unknown>> {
  return [{
    [BULK_CLAIM_MARKER]: {
      mode: "bulk",
      quantity,
      openings,
    },
  }];
}

export function decodeClaimForRequest(
  storedRewards: Array<Record<string, unknown>>,
  mode: PackOpenMode,
  quantity: number,
): { kind: "single"; rewards: Array<Record<string, unknown>> }
  | { kind: "bulk"; quantity: number; openings: PackOpenings }
  | { kind: "conflict" } {
  const hasBulkMarker = storedRewards.some((reward) => isRecord(reward)
    && Object.prototype.hasOwnProperty.call(reward, BULK_CLAIM_MARKER));
  if (hasBulkMarker) {
    if (storedRewards.length !== 1 || !isRecord(storedRewards[0])) return { kind: "conflict" };
    const marker = storedRewards[0][BULK_CLAIM_MARKER];
    if (!isRecord(marker)) return { kind: "conflict" };

    const claim = marker as { mode?: unknown; quantity?: unknown; openings?: unknown };
    const claimQuantity = parseBulkPackQuantity(claim.quantity);
    if (claim.mode !== "bulk" || claimQuantity === null || !isValidBulkOpenings(claim.openings, claimQuantity)) {
      return { kind: "conflict" };
    }
    if (mode !== "bulk" || claimQuantity !== quantity) return { kind: "conflict" };
    return { kind: "bulk", quantity: claimQuantity, openings: claim.openings };
  }

  if (mode !== "single" || quantity !== 1) return { kind: "conflict" };
  return { kind: "single", rewards: storedRewards };
}
import type { PrismEconomySettingRecord } from "@workspace/db";

export const PRISM_RARITIES = ["NORMAL", "LEGENDARY"] as const;
export type PrismRarity = (typeof PRISM_RARITIES)[number];

export type PrismSettingView = {
  rarity: PrismRarity;
  craftCost: number | null;
  disenchantReward: number | null;
  configured: boolean;
};

export function isPrismRarity(value: unknown): value is PrismRarity {
  return typeof value === "string" && PRISM_RARITIES.includes(value as PrismRarity);
}

export function isValidPrismValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function toPrismSettingView(
  rarity: PrismRarity,
  row?: PrismEconomySettingRecord,
): PrismSettingView {
  const configured = Boolean(
    row &&
    row.rarity === rarity &&
    isValidPrismValue(row.craftCost) &&
    isValidPrismValue(row.disenchantReward),
  );
  return {
    rarity,
    craftCost: configured ? row!.craftCost : null,
    disenchantReward: configured ? row!.disenchantReward : null,
    configured,
  };
}
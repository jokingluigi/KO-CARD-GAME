import { championPrismEconomySettingsTable, db, type ChampionPrismEconomySettingRecord } from "@workspace/db";
import { eq } from "drizzle-orm";

export const CHAMPION_PRISM_CONFIG_ID = "default";

export type ChampionPrismSettingView = {
  craftCost: number | null;
  duplicateReward: number | null;
  configured: boolean;
};

export function isValidChampionPrismValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function toChampionPrismSettingView(
  row?: ChampionPrismEconomySettingRecord,
): ChampionPrismSettingView {
  const configured = Boolean(
    row &&
    row.id === CHAMPION_PRISM_CONFIG_ID &&
    isValidChampionPrismValue(row.craftCost) &&
    isValidChampionPrismValue(row.duplicateReward),
  );
  return {
    craftCost: configured ? row!.craftCost : null,
    duplicateReward: configured ? row!.duplicateReward : null,
    configured,
  };
}

type QueryExecutor = { select: typeof db.select };

export async function getChampionPrismSetting(executor: QueryExecutor = db) {
  const [row] = await executor.select().from(championPrismEconomySettingsTable)
    .where(eq(championPrismEconomySettingsTable.id, CHAMPION_PRISM_CONFIG_ID))
    .limit(1);
  return row && isValidChampionPrismValue(row.craftCost) && isValidChampionPrismValue(row.duplicateReward)
    ? row
    : null;
}
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cardsTable } from "./cards";
import { championsTable } from "./champions";

export const prismEconomySettingsTable = pgTable("prism_economy_settings", {
  rarity: text("rarity").primaryKey(),
  craftCost: integer("craft_cost").notNull(),
  disenchantReward: integer("disenchant_reward").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prismTransactionsTable = pgTable("prism_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  cardDefinitionId: text("card_definition_id").references(() => cardsTable.id, { onDelete: "set null" }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const championPrismEconomySettingsTable = pgTable("champion_prism_economy_settings", {
  id: text("id").primaryKey(),
  craftCost: integer("craft_cost").notNull(),
  duplicateReward: integer("duplicate_reward").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const championPrismTransactionsTable = pgTable("champion_prism_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  championDefinitionId: text("champion_definition_id").references(() => championsTable.id, { onDelete: "set null" }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrismEconomySettingRecord = typeof prismEconomySettingsTable.$inferSelect;
export type PrismTransactionRecord = typeof prismTransactionsTable.$inferSelect;
export type ChampionPrismEconomySettingRecord = typeof championPrismEconomySettingsTable.$inferSelect;
export type ChampionPrismTransactionRecord = typeof championPrismTransactionsTable.$inferSelect;
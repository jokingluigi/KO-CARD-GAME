import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const packDefinitionsTable = pgTable("pack_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageAssetId: text("image_asset_id"),
  imageUrl: text("image_url"),
  cardsPerPack: integer("cards_per_pack").notNull().default(1),
  starterRewardQuantity: integer("starter_reward_quantity").notNull().default(0),
  normalRate: integer("normal_rate").notNull().default(90),
  legendaryRate: integer("legendary_rate").notNull().default(7),
  championRate: integer("champion_rate").notNull().default(3),
  skinChance: integer("skin_chance").notNull().default(0),
  normalCardPool: text("normal_card_pool").array().notNull().default(sql`ARRAY[]::text[]`),
  legendaryCardPool: text("legendary_card_pool").array().notNull().default(sql`ARRAY[]::text[]`),
  championPool: text("champion_pool").array().notNull().default(sql`ARRAY[]::text[]`),
  skinPool: text("skin_pool").array().notNull().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default("DRAFT"),
  version: integer("version").notNull().default(1),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const packOpeningClaimsTable = pgTable("pack_opening_claims", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  packDefinitionId: text("pack_definition_id").notNull().references(() => packDefinitionsTable.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  rewards: jsonb("rewards").$type<Array<Record<string, unknown>>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdempotencyKeyUnique: uniqueIndex("pack_opening_claims_user_id_idempotency_key_idx")
    .on(table.userId, table.idempotencyKey),
}));

export type PackDefinitionRecord = typeof packDefinitionsTable.$inferSelect;
export type PackOpeningClaimRecord = typeof packOpeningClaimsTable.$inferSelect;
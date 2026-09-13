import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const packDefinitionsTable = pgTable("pack_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageAssetId: text("image_asset_id"),
  imageUrl: text("image_url"),
  cardsPerPack: integer("cards_per_pack").notNull().default(1),
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

export type PackDefinitionRecord = typeof packDefinitionsTable.$inferSelect;
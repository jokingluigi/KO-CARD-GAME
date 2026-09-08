import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const cardsTable = pgTable("cards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cardType: text("card_type").notNull(),
  cost: integer("cost").notNull(),
  attack: integer("attack").notNull(),
  health: integer("health").notNull(),
  text: text("text").notNull(),
  keywords: text("keywords")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  isToken: boolean("is_token").notNull().default(false),
  isChampionToken: boolean("is_champion_token").notNull().default(false),
  effectId: text("effect_id"),
  effectConfig: jsonb("effect_config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  imageAssetId: text("image_asset_id"),
  imageUrl: text("image_url"),
  imageDisplayMode: text("image_display_mode").notNull().default("COVER"),
  imageScale: real("image_scale").notNull().default(1),
  imagePositionX: integer("image_position_x").notNull().default(50),
  imagePositionY: integer("image_position_y").notNull().default(50),
  status: text("status").notNull().default("DRAFT"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CardRecord = typeof cardsTable.$inferSelect;
export type NewCardRecord = typeof cardsTable.$inferInsert;
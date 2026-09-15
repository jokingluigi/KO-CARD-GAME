import { boolean, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

export const cardFrameDefinitionsTable = pgTable("card_frame_definitions", {
  id: text("id").primaryKey(),
  cardType: text("card_type").notNull(),
  rarity: text("rarity").notNull(),
  frameAssetId: text("frame_asset_id"),
  frameUrl: text("frame_url"),
  enabled: boolean("enabled").notNull().default(true),
  frameScale: real("frame_scale").notNull().default(1.1),
  frameOffsetX: real("frame_offset_x").notNull().default(0),
  frameOffsetY: real("frame_offset_y").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  cardFrameTypeRarityUnique: unique("card_frame_type_rarity_unique").on(table.cardType, table.rarity),
}));

export type CardFrameDefinitionRecord = typeof cardFrameDefinitionsTable.$inferSelect;
export type NewCardFrameDefinitionRecord = typeof cardFrameDefinitionsTable.$inferInsert;
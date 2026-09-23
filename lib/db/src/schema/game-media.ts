import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const gameMediaTable = pgTable("game_media", {
  id: text("id").primaryKey(),
  mediaType: text("media_type").notNull(),
  name: text("name").notNull(),
  assetId: text("asset_id").notNull(),
  assetUrl: text("asset_url").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  volume: integer("volume").notNull().default(100),
  /** Whether this asset is available for in-game match selection. */
  gameEnabled: boolean("game_enabled").notNull().default(true),
  /** Whether this asset is selected for the title/main menu. */
  titleEnabled: boolean("title_enabled").notNull().default(false),
  /** Legacy aliases retained while existing clients/data migrate. */
  enabled: boolean("enabled").notNull().default(true),
  mainEnabled: boolean("main_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GameMediaRecord = typeof gameMediaTable.$inferSelect;
export type NewGameMediaRecord = typeof gameMediaTable.$inferInsert;
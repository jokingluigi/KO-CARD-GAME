import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const aiDecksTable = pgTable("ai_decks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  championDefinitionId: text("champion_definition_id"),
  cardDefinitionIds: text("card_definition_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  enabled: boolean("enabled").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AIDeckRecord = typeof aiDecksTable.$inferSelect;
export type NewAIDeckRecord = typeof aiDecksTable.$inferInsert;
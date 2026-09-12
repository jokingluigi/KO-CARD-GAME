import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const decksTable = pgTable("decks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  championDefinitionId: text("champion_definition_id"),
  cardDefinitionIds: text("card_definition_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeckRecord = typeof decksTable.$inferSelect;
export type NewDeckRecord = typeof decksTable.$inferInsert;
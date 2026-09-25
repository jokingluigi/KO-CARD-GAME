import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const championIntroInteractionsTable = pgTable("champion_intro_interactions", {
  id: text("id").primaryKey(),
  // Keep these IDs after Champion deletion so Admin can surface and remove
  // broken dialogue references instead of silently deleting their history.
  championOneId: text("champion_one_id").notNull(),
  championTwoId: text("champion_two_id").notNull(),
  lineOne: text("line_one"),
  lineTwo: text("line_two"),
  firstSpeaker: text("first_speaker").notNull().default("ONE"),
  status: text("status").notNull().default("DRAFT"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pairUnique: uniqueIndex("champion_intro_interactions_pair_unique").on(table.championOneId, table.championTwoId),
  championOneIdx: index("champion_intro_interactions_champion_one_idx").on(table.championOneId),
  championTwoIdx: index("champion_intro_interactions_champion_two_idx").on(table.championTwoId),
  canonicalPairCheck: check("champion_intro_interactions_canonical_pair_check", sql`${table.championOneId} < ${table.championTwoId}`),
  statusCheck: check("champion_intro_interactions_status_check", sql`${table.status} IN ('DRAFT', 'PUBLISHED', 'DISABLED')`),
}));

export type ChampionIntroInteractionRecord = typeof championIntroInteractionsTable.$inferSelect;
export type NewChampionIntroInteractionRecord = typeof championIntroInteractionsTable.$inferInsert;
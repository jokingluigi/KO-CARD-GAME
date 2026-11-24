import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** 보스전: 관리자가 만드는 스테이지형 보스. */
export const bossesTable = pgTable("bosses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("DRAFT"),
  stageOrder: integer("stage_order").notNull().default(1),
  aiDeckId: text("ai_deck_id"),
  firstClearReward: integer("first_clear_reward").notNull().default(300),
  playerHealthBonus: integer("player_health_bonus").notNull().default(0),
  phases: jsonb("phases").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  introDialogue: jsonb("intro_dialogue").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  clearDialogue: jsonb("clear_dialogue").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 사용자별 보스 클리어 기록. */
export const bossClearsTable = pgTable("boss_clears", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bossId: text("boss_id").notNull(),
  clearCount: integer("clear_count").notNull().default(1),
  firstClearedAt: timestamp("first_cleared_at", { withTimezone: true }).notNull().defaultNow(),
  lastClearedAt: timestamp("last_cleared_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.userId, table.bossId] }) }));

export type BossRecord = typeof bossesTable.$inferSelect;

import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const rewardSettingsTable = pgTable("reward_settings", {
  key: text("key").primaryKey(),
  rewardType: text("reward_type").notNull().default("CURRENCY"),
  amount: integer("amount").notNull().default(0),
  rewardTargetId: text("reward_target_id"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rewardGrantsTable = pgTable("reward_grants", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  rewardType: text("reward_type").notNull(),
  amount: integer("amount").notNull(),
  rewardTargetId: text("reward_target_id"),
  balanceAfter: integer("balance_after").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userSourceIdx: index("reward_grants_user_source_idx").on(table.userId, table.sourceType, table.sourceId),
}));

export const dailyQuestDefinitionsTable = pgTable("daily_quest_definitions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  objectiveType: text("objective_type").notNull(),
  cardType: text("card_type"),
  targetValue: integer("target_value").notNull(),
  rewardType: text("reward_type").notNull().default("CURRENCY"),
  rewardAmount: integer("reward_amount").notNull().default(0),
  rewardTargetId: text("reward_target_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyQuestAssignmentsTable = pgTable("daily_quest_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  definitionId: text("definition_id").notNull().references(() => dailyQuestDefinitionsTable.id, { onDelete: "restrict" }),
  assignmentDate: text("assignment_date").notNull(),
  slot: integer("slot").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  objectiveType: text("objective_type").notNull(),
  cardType: text("card_type"),
  targetValue: integer("target_value").notNull(),
  rewardType: text("reward_type").notNull(),
  rewardAmount: integer("reward_amount").notNull(),
  rewardTargetId: text("reward_target_id"),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("ASSIGNED"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateDefinitionIdx: uniqueIndex("daily_quest_assignments_user_date_definition_idx").on(table.userId, table.assignmentDate, table.definitionId),
  userDateSlotIdx: uniqueIndex("daily_quest_assignments_user_date_slot_idx").on(table.userId, table.assignmentDate, table.slot),
  userDateIdx: index("daily_quest_assignments_user_date_idx").on(table.userId, table.assignmentDate),
}));

export const dailyQuestProgressEventsTable = pgTable("daily_quest_progress_events", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => dailyQuestAssignmentsTable.id, { onDelete: "cascade" }),
  occurrenceKey: text("occurrence_key").notNull().unique(),
  increment: integer("increment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceRewardDefinitionsTable = pgTable("attendance_reward_definitions", {
  dayIndex: integer("day_index").primaryKey(),
  rewardType: text("reward_type").notNull().default("CURRENCY"),
  rewardAmount: integer("reward_amount").notNull().default(0),
  rewardTargetId: text("reward_target_id"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceClaimsTable = pgTable("attendance_claims", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  claimDate: text("claim_date").notNull(),
  dayIndex: integer("day_index").notNull().references(() => attendanceRewardDefinitionsTable.dayIndex, { onDelete: "restrict" }),
  rewardType: text("reward_type").notNull(),
  rewardAmount: integer("reward_amount").notNull(),
  rewardTargetId: text("reward_target_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateIdx: uniqueIndex("attendance_claims_user_date_idx").on(table.userId, table.claimDate),
  userDayIdx: uniqueIndex("attendance_claims_user_day_idx").on(table.userId, table.dayIndex),
}));

export type RewardSettingRecord = typeof rewardSettingsTable.$inferSelect;
export type RewardGrantRecord = typeof rewardGrantsTable.$inferSelect;
export type DailyQuestDefinitionRecord = typeof dailyQuestDefinitionsTable.$inferSelect;
export type DailyQuestAssignmentRecord = typeof dailyQuestAssignmentsTable.$inferSelect;
export type AttendanceRewardDefinitionRecord = typeof attendanceRewardDefinitionsTable.$inferSelect;
export type AttendanceClaimRecord = typeof attendanceClaimsTable.$inferSelect;
import {sql} from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const draftSettingsTable = pgTable("draft_settings", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const draftSessionsTable = pgTable("draft_sessions", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(0),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  usageDiagnostic: boolean("usage_diagnostic").notNull().default(false),
  usageRecordedAt:timestamp("usage_recorded_at",{withTimezone:true}),
  usageStart: jsonb("usage_start").$type<Record<string, unknown> | null>(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
},table=>[index('draft_sessions_usage_idx').on(table.updatedAt).where(sql`${table.usageStart} IS NOT NULL AND ${table.usageRecordedAt} IS NULL`)]).enableRLS();

export const draftParticipantsTable = pgTable("draft_participants", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id),
  sessionId: text("session_id")
    .notNull()
    .references(() => draftSessionsTable.id),
});

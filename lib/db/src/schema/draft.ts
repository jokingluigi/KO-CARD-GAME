import {
  boolean,
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
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const draftParticipantsTable = pgTable("draft_participants", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id),
  sessionId: text("session_id")
    .notNull()
    .references(() => draftSessionsTable.id),
});

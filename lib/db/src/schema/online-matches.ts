import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { decksTable } from "./decks";
import { usersTable } from "./users";

export const onlineMatchStatusEnum = pgEnum("ko_online_match_status", [
  "WAITING",
  "ACTIVE",
  "ENDED",
  "CANCELLED",
]);

export const onlineMatchesTable = pgTable("online_matches", {
  id: text("id").primaryKey(),
  status: onlineMatchStatusEnum("status").notNull().default("WAITING"),
  player1UserId: text("player1_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  player2UserId: text("player2_user_id").references(() => usersTable.id, { onDelete: "restrict" }),
  player1DeckId: text("player1_deck_id").notNull().references(() => decksTable.id, { onDelete: "restrict" }),
  player2DeckId: text("player2_deck_id").references(() => decksTable.id, { onDelete: "restrict" }),
  serializedSnapshot: jsonb("serialized_snapshot").notNull(),
  serializedGameState: jsonb("serialized_game_state").notNull(),
  stateVersion: integer("state_version").notNull().default(0),
  turnStartedAt: timestamp("turn_started_at", { withTimezone: true }),
  turnDeadlineAt: timestamp("turn_deadline_at", { withTimezone: true }),
  player1DisconnectStartedAt: timestamp("player1_disconnect_started_at", { withTimezone: true }),
  player1ReconnectDeadlineAt: timestamp("player1_reconnect_deadline_at", { withTimezone: true }),
  player2DisconnectStartedAt: timestamp("player2_disconnect_started_at", { withTimezone: true }),
  player2ReconnectDeadlineAt: timestamp("player2_reconnect_deadline_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  winnerUserId: text("winner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  resultReason: text("result_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  player1UserIdIdx: index("online_matches_player1_user_id_idx").on(table.player1UserId),
  player2UserIdIdx: index("online_matches_player2_user_id_idx").on(table.player2UserId),
  statusIdx: index("online_matches_status_idx").on(table.status),
}));

export type OnlineMatchRecord = typeof onlineMatchesTable.$inferSelect;
export type NewOnlineMatchRecord = typeof onlineMatchesTable.$inferInsert;
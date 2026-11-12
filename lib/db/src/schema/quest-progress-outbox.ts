import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
export const questProgressOutboxTable = pgTable(
  "quest_progress_outbox",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull(),
    playerOneUserId: text("player_one_user_id").notNull(),
    playerTwoUserId: text("player_two_user_id").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quest_progress_outbox_due_idx").on(table.availableAt),
    index("quest_progress_outbox_one_idx").on(table.playerOneUserId),
    index("quest_progress_outbox_two_idx").on(table.playerTwoUserId),
  ],
);

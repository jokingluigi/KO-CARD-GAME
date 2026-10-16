import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uuid,
  date,
  index,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
const at = (name: string) => timestamp(name, { withTimezone: true });
const n = (name: string) => bigint(name, { mode: "number" }).notNull();
export const usageCollectionTable = pgTable(
  "usage_collection",
  {
    id: text("id").primaryKey(),
    startedAt: at("started_at").notNull().defaultNow(),
    refreshedAt: at("refreshed_at"),
    lastErrorAt: at("last_error_at"),
    lastPrunedAt: at("last_pruned_at"),
  },
  (t) => [check("usage_collection_id_check", sql`${t.id}='global'`)],
).enableRLS();
export const usageProcessedSourcesTable = pgTable("usage_processed_sources", {
  sourceKey: text("source_key").primaryKey(),
  processedAt: at("processed_at").notNull().defaultNow(),
}).enableRLS();
export const usageCollectionFailuresTable = pgTable(
  "usage_collection_failures",
  {
    sourceKey: text("source_key").primaryKey(),
    attempts: integer("attempts").notNull().default(1),
    nextRetryAt: at("next_retry_at").notNull(),
    lastFailedAt: at("last_failed_at").notNull().defaultNow(),
    lastCode: text("last_code").notNull(),
  },
).enableRLS();
export const usageExcludedAccountsTable = pgTable("usage_excluded_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
}).enableRLS();
export const usageSourceRlsBaselineTable = pgTable(
  "usage_source_rls_baseline",
  {
    tableName: text("table_name").primaryKey(),
    wasEnabled: boolean("was_enabled").notNull(),
  },
).enableRLS();
export const usageParticipationsTable = pgTable(
  "usage_participations",
  {
    id: uuid("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    subjectKey: uuid("subject_key").notNull(),
    championId: text("champion_id").notNull(),
    startedAt: at("started_at").notNull(),
    endedAt: at("ended_at").notNull(),
    day: date("day").notNull(),
    outcome: text("outcome").notNull(),
    deckKnown: boolean("deck_known").notNull(),
    abilityUses: integer("ability_uses").notNull(),
    questEligible: boolean("quest_eligible").notNull(),
    questCompleted: boolean("quest_completed").notNull(),
    questTurn: integer("quest_turn"),
  },
  (t) => [
    unique("usage_participations_source_key_subject_key_key").on(
      t.sourceKey,
      t.subjectKey,
    ),
    index("usage_participations_day_idx").on(t.day, t.subjectKey),
    index("usage_participations_champion_day_idx").on(
      t.championId,
      t.day,
      t.subjectKey,
    ),
    check(
      "usage_participations_outcome_check",
      sql`${t.outcome} IN ('WIN','LOSS','DRAW')`,
    ),
    check("usage_participations_ability_uses_check", sql`${t.abilityUses}>=0`),
    check("usage_participations_quest_turn_check", sql`${t.questTurn}>=0`),
  ],
).enableRLS();
export const usageCardMatchesTable = pgTable(
  "usage_card_matches",
  {
    participationId: uuid("participation_id")
      .notNull()
      .references(() => usageParticipationsTable.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    deckCopies: integer("deck_copies").notNull(),
    plays: integer("plays").notNull(),
    generated: integer("generated").notNull(),
    summons: integer("summons").notNull(),
  },
  (t) => [
    primaryKey({
      name: "usage_card_matches_pkey",
      columns: [t.participationId, t.cardId],
    }),
    index("usage_card_matches_card_idx").on(t.cardId, t.participationId),
    ...(["deckCopies", "plays", "generated", "summons"] as const).map((key) =>
      check(
        "usage_card_matches_" +
          {
            deckCopies: "deck_copies",
            plays: "plays",
            generated: "generated",
            summons: "summons",
          }[key] +
          "_check",
        sql`${t[key]}>=0`,
      ),
    ),
  ],
).enableRLS();
export const usageDailyTotalsTable = pgTable("usage_daily_totals", {
  day: date("day").primaryKey(),
  participations: n("participations"),
  deckKnown: n("deck_known"),
}).enableRLS();
export const usageCardDailyTable = pgTable(
  "usage_card_daily",
  {
    day: date("day").notNull(),
    cardId: text("card_id").notNull(),
    adoptions: n("adoptions"),
    copies: n("copies"),
    plays: n("plays"),
    playedMatches: n("played_matches"),
    wins: n("wins"),
    losses: n("losses"),
    draws: n("draws"),
    generated: n("generated"),
    summons: n("summons"),
  },
  (t) => [
    primaryKey({ name: "usage_card_daily_pkey", columns: [t.day, t.cardId] }),
    index("usage_card_daily_card_day_idx").on(t.cardId, t.day),
  ],
).enableRLS();
export const usageChampionDailyTable = pgTable(
  "usage_champion_daily",
  {
    day: date("day").notNull(),
    championId: text("champion_id").notNull(),
    selections: n("selections"),
    wins: n("wins"),
    losses: n("losses"),
    draws: n("draws"),
    abilityUses: n("ability_uses"),
    abilityMatches: n("ability_matches"),
    questEligible: n("quest_eligible"),
    questCompleted: n("quest_completed"),
    questTurnSum: n("quest_turn_sum"),
    questTurnSamples: n("quest_turn_samples"),
    completedWins: n("completed_wins"),
    completedLosses: n("completed_losses"),
    completedDraws: n("completed_draws"),
    incompleteWins: n("incomplete_wins"),
    incompleteLosses: n("incomplete_losses"),
    incompleteDraws: n("incomplete_draws"),
  },
  (t) => [
    primaryKey({
      name: "usage_champion_daily_pkey",
      columns: [t.day, t.championId],
    }),
    index("usage_champion_daily_champion_day_idx").on(t.championId, t.day),
  ],
).enableRLS();
export const usageCardUsersDailyTable = pgTable(
  "usage_card_users_daily",
  {
    day: date("day").notNull(),
    cardId: text("card_id").notNull(),
    subjectKey: uuid("subject_key").notNull(),
  },
  (t) => [
    primaryKey({
      name: "usage_card_users_daily_pkey",
      columns: [t.cardId, t.day, t.subjectKey],
    }),
    index("usage_card_users_daily_day_idx").on(t.day, t.cardId, t.subjectKey),
  ],
).enableRLS();
export const usageChampionUsersDailyTable = pgTable(
  "usage_champion_users_daily",
  {
    day: date("day").notNull(),
    championId: text("champion_id").notNull(),
    subjectKey: uuid("subject_key").notNull(),
  },
  (t) => [
    primaryKey({
      name: "usage_champion_users_daily_pkey",
      columns: [t.championId, t.day, t.subjectKey],
    }),
    index("usage_champion_users_daily_day_idx").on(
      t.day,
      t.championId,
      t.subjectKey,
    ),
  ],
).enableRLS();

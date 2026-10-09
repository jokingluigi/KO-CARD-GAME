import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersTable } from './users';

export const towerSettingsTable = pgTable('tower_settings', {
  id: text('id').primaryKey().default('global'), enabled: boolean('enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerSeasonsTable = pgTable('tower_seasons', {
  id: text('id').primaryKey(), name: text('name').notNull(), active: boolean('active').notNull().default(false),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('tower_one_active_season').on(table.active).where(sql`${table.active} = true`)]);

export const towerStartersTable = pgTable('tower_starters', {
  id: text('id').primaryKey(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerPresetsTable = pgTable('tower_presets', {
  id: text('id').primaryKey(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerRelicsTable = pgTable('tower_relics', {
  id: text('id').primaryKey(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerCharactersTable = pgTable('tower_characters', {
  id: text('id').primaryKey(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerScenesTable = pgTable('tower_scenes', {
  id: text('id').primaryKey(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const towerMetadataTable = pgTable('tower_metadata', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), data: jsonb('data').$type<Record<string, unknown>>().notNull(),
});
export const towerRunsTable = pgTable('tower_runs', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => usersTable.id),
  seasonId: text('season_id').notNull().references(() => towerSeasonsTable.id),
  version: integer('version').notNull().default(0), isTest: boolean('is_test').notNull().default(false), ended: boolean('ended').notNull().default(false),
  state: jsonb('state').$type<Record<string, unknown>>().notNull(), snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  initialBattle: jsonb('initial_battle').$type<Record<string, unknown> | null>(),
  currentBattle: jsonb('current_battle').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('tower_one_live_run_per_user').on(table.userId).where(sql`${table.ended} = false AND ${table.isTest} = false`), index('tower_run_user_history').on(table.userId, table.createdAt)]);
export const towerBossClearsTable = pgTable('tower_boss_clears', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => usersTable.id),
  seasonId: text('season_id').notNull().references(() => towerSeasonsTable.id), bossSlotId: text('boss_slot_id').notNull(),
  firstRunId: text('first_run_id').notNull().references(() => towerRunsTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('tower_first_boss_clear').on(table.userId, table.seasonId, table.bossSlotId)]);
export const towerBossReceiptsTable = pgTable('tower_boss_receipts', {
  id: text('id').primaryKey(), runId: text('run_id').notNull().references(() => towerRunsTable.id),
  bossSlotId: text('boss_slot_id').notNull(), firstClear: boolean('first_clear').notNull(),
  reward: jsonb('reward').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('tower_one_reward_per_run_boss').on(table.runId, table.bossSlotId)]);

export const towerUnlocksTable = pgTable('tower_unlocks', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => usersTable.id),
  kind: text('kind').notNull(), targetId: text('target_id').notNull(),
  sourceRunId: text('source_run_id').notNull().references(() => towerRunsTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('tower_permanent_unlock').on(table.userId, table.kind, table.targetId)]);

/** Published versions are append-only complete snapshots. Existing run snapshots stay valid. */
export const towerVersionsTable=pgTable('tower_versions',{
 id:text('id').primaryKey(),towerId:text('tower_id').notNull().references(()=>towerSeasonsTable.id),version:integer('version').notNull(),snapshot:jsonb('snapshot').$type<Record<string,unknown>>().notNull(),publishedBy:text('published_by').notNull().references(()=>usersTable.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('tower_version_unique').on(t.towerId,t.version)]);

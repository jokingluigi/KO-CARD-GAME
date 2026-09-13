import { integer, pgTable, primaryKey, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { cardsTable, cardSkinDefinitionsTable } from "./cards";
import { championsTable } from "./champions";
import { packDefinitionsTable } from "./packs";

export const userPackInventoryTable = pgTable("user_pack_inventory", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  packDefinitionId: text("pack_definition_id").notNull().references(() => packDefinitionsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.packDefinitionId] }),
}));

export const userCardCollectionsTable = pgTable("user_card_collections", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  cardDefinitionId: text("card_definition_id").notNull().references(() => cardsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.cardDefinitionId] }),
}));

export const userChampionCollectionsTable = pgTable("user_champion_collections", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  championDefinitionId: text("champion_definition_id").notNull().references(() => championsTable.id, { onDelete: "cascade" }),
  owned: boolean("owned").notNull().default(true),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.championDefinitionId] }),
}));

export const userCardSkinCollectionsTable = pgTable("user_card_skin_collections", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  skinDefinitionId: text("skin_definition_id").notNull().references(() => cardSkinDefinitionsTable.id, { onDelete: "cascade" }),
  obtainedAt: timestamp("obtained_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.skinDefinitionId] }),
}));

export type UserCardCollectionRecord = typeof userCardCollectionsTable.$inferSelect;
export type UserChampionCollectionRecord = typeof userChampionCollectionsTable.$inferSelect;
export type UserPackInventoryRecord = typeof userPackInventoryTable.$inferSelect;
export type UserCardSkinCollectionRecord = typeof userCardSkinCollectionsTable.$inferSelect;
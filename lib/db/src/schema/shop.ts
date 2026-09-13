import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { packDefinitionsTable } from "./packs";
import { usersTable } from "./users";

export const shopListingsTable = pgTable("shop_listings", {
  id: text("id").primaryKey(),
  packDefinitionId: text("pack_definition_id").notNull().references(() => packDefinitionsTable.id, { onDelete: "cascade" }),
  price: integer("price").notNull(),
  isActive: integer("is_active").notNull().default(1),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const currencyTransactionsTable = pgTable("currency_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShopListingRecord = typeof shopListingsTable.$inferSelect;
export type CurrencyTransactionRecord = typeof currencyTransactionsTable.$inferSelect;
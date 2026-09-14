import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { packDefinitionsTable } from "./packs";
import { usersTable } from "./users";

export const shopListingsTable = pgTable("shop_listings", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  imageAssetId: text("image_asset_id"),
  productType: text("product_type").notNull().default("PACK"),
  packDefinitionId: text("pack_definition_id").notNull().references(() => packDefinitionsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // Kept for compatibility with the first user shop implementation.
  isActive: integer("is_active").notNull().default(1),
  displayOrder: integer("display_order").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const currencyTransactionsTable = pgTable("currency_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  relatedListingId: text("related_listing_id").references(() => shopListingsTable.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  currencyType: text("currency_type").notNull().default("SHOP_CURRENCY"),
  type: text("type").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShopListingRecord = typeof shopListingsTable.$inferSelect;
export type CurrencyTransactionRecord = typeof currencyTransactionsTable.$inferSelect;
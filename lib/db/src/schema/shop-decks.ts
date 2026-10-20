import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
/** Independent catalog: card IDs reference live definitions, never cloned card records. */
export const shopDecksTable = pgTable(
  "shop_decks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    cardDefinitionIds: text("card_definition_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    price: integer("price").notNull(),
    recommendedChampionId: text("recommended_champion_id"),
    includeChampion: boolean("include_champion").notNull().default(false),
    allowUnpublished: boolean("allow_unpublished").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("shop_decks_listing_idx").on(t.enabled, t.displayOrder),
    check("shop_decks_price_check", sql`${t.price} >= 0`),
    check(
      "shop_decks_champion",
      sql`NOT ${t.includeChampion} OR ${t.recommendedChampionId} IS NOT NULL`,
    ),
  ],
).enableRLS();
export const shopDeckPurchasesTable = pgTable(
  "shop_deck_purchases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => shopDecksTable.id),
    deckId: text("deck_id").notNull(),
    price: integer("price").notNull(),
    receipt: jsonb("receipt")
      .$type<{
        name: string;
        cardDefinitionIds: string[];
        championDefinitionId: string;
        includedChampionId: string | null;
        grantedCards: Record<string, number>;
        balanceAfter: number;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shop_deck_purchase_once").on(t.userId, t.productId),
    check("shop_deck_purchases_price_check", sql`${t.price} >= 0`),
  ],
).enableRLS();

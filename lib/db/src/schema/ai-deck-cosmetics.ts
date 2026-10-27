import { pgTable, text, primaryKey } from "drizzle-orm/pg-core";
import { aiDecksTable } from "./ai-decks";
import { cosmeticItemsTable } from "./cosmetics";
/** AI presentation only. Never grants inventory to a player. */
export const aiDeckCosmeticsTable = pgTable(
  "ai_deck_cosmetics",
  {
    deckId: text("deck_id")
      .notNull()
      .references(() => aiDecksTable.id, { onDelete: "cascade" }),
    cosmeticId: text("cosmetic_id")
      .notNull()
      .references(() => cosmeticItemsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.deckId, t.cosmeticId] })],
).enableRLS();

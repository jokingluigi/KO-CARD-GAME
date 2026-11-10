import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const cardTagsTable = pgTable("card_tags", {
  name: text("name").primaryKey(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

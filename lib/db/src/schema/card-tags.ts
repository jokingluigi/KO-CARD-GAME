import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const cardTagsTable = pgTable("card_tags", {
  name: text("name").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

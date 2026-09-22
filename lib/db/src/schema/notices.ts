import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const noticesTable = pgTable("notices", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NoticeRecord = typeof noticesTable.$inferSelect;
export type NewNoticeRecord = typeof noticesTable.$inferInsert;
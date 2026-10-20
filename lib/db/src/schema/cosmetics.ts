import {
  pgTable,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  primaryKey,
  unique,
  foreignKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
export const cosmeticItemsTable = pgTable(
  "cosmetic_items",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    targetId: text("target_id"),
    imageAssets: jsonb("image_assets")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "cosmetic_type",
      sql`${t.type} IN ('CHAMPION_SKIN','CARD_SKIN','CARD_BACK','IMAGE_EMOTE')`,
    ),
    check(
      "cosmetic_target",
      sql`((${t.type} IN ('CHAMPION_SKIN','CARD_SKIN')) = (${t.targetId} IS NOT NULL))`,
    ),
    index("cosmetics_catalog_order").on(t.isActive, t.sortOrder),
  ],
).enableRLS();
export const userCosmeticsTable = pgTable(
  "user_cosmetics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    cosmeticId: text("cosmetic_id")
      .notNull()
      .references(() => cosmeticItemsTable.id),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acquisitionSource: text("acquisition_source").notNull().default("ADMIN"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cosmeticId] })],
).enableRLS();
export const equippedCosmeticsTable = pgTable(
  "user_equipped_cosmetics",
  {
    userId: text("user_id").notNull(),
    slot: text("slot").notNull(),
    cosmeticId: text("cosmetic_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.slot] }),
    unique("cosmetic_equipped_once").on(t.userId, t.cosmeticId),
    foreignKey({
      columns: [t.userId, t.cosmeticId],
      foreignColumns: [
        userCosmeticsTable.userId,
        userCosmeticsTable.cosmeticId,
      ],
    }).onDelete("cascade"),
    check(
      "cosmetic_slot",
      sql`${t.slot}='back' OR ${t.slot} ~ '^(champion|card):.+$' OR ${t.slot} ~ '^emote:[1-4]$'`,
    ),
  ],
).enableRLS();
export const cosmeticAuditTable = pgTable("cosmetic_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  userId: text("user_id"),
  cosmeticId: text("cosmetic_id").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

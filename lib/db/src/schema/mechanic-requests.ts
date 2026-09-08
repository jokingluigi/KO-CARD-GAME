import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mechanicRequestStatus = pgEnum("mechanic_request_status", [
  "PENDING",
  "ANALYZING",
  "READY_TO_GENERATE",
  "GENERATING",
  "TESTING",
  "READY_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "FAILED",
]);

export const mechanicRequestsTable = pgTable("mechanic_requests", {
  id: text("id").primaryKey(),
  status: mechanicRequestStatus("status").notNull().default("PENDING"),
  originalCardText: text("original_card_text").notNull(),
  analysisResult: jsonb("analysis_result")
    .$type<unknown>()
    .notNull(),
  unsupportedParts: text("unsupported_parts").array().notNull(),
  requestedBy: text("requested_by").notNull(),
  proposedEffectName: text("proposed_effect_name"),
  proposedDescription: text("proposed_description"),
  affectedSystems: text("affected_systems").array(),
  generatedPatchSummary: text("generated_patch_summary"),
  testResult: text("test_result"),
  resolvedEffectIds: text("resolved_effect_ids").array(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("mechanic_requests_pending_original_card_text_unique")
    .on(table.originalCardText)
    .where(sql`${table.status} = 'PENDING'`),
]);

export const insertMechanicRequestSchema = createInsertSchema(
  mechanicRequestsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMechanicRequest = z.infer<typeof insertMechanicRequestSchema>;
export type MechanicRequest = typeof mechanicRequestsTable.$inferSelect;
export type NewMechanicRequest = typeof mechanicRequestsTable.$inferInsert;
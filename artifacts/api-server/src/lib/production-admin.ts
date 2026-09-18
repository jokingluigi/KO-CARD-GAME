import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { ensureStarterCollection } from "./collection";
import { ensureStartingShopCurrency } from "./shop-currency";
import {
  hashPassword,
  isValidEmail,
  isValidNickname,
  normalizeEmail,
} from "./auth";
import { logger } from "./logger";

const STARTING_CURRENCY = Math.max(
  0,
  Number.parseInt(process.env["STARTING_CURRENCY"] ?? "1000", 10) || 1000,
);

type ProductionAdminConfig = {
  email: string;
  username: string;
  password: string;
};

function readProductionAdminConfig(): ProductionAdminConfig | null {
  if (process.env["NODE_ENV"] !== "production") return null;

  const email = normalizeEmail(process.env["ADMIN_EMAIL"] ?? "");
  const username = (process.env["ADMIN_USERNAME"] ?? "").trim();
  const password = process.env["ADMIN_PASSWORD"] ?? "";
  const configured = [email, username, password].filter(Boolean).length;

  if (configured === 0) return null;
  if (configured !== 3) {
    throw new Error(
      "Production ADMIN bootstrap requires ADMIN_EMAIL, ADMIN_USERNAME, and ADMIN_PASSWORD.",
    );
  }
  if (!isValidEmail(email)) {
    throw new Error("Production ADMIN_EMAIL must be a valid email address.");
  }
  if (!isValidNickname(username)) {
    throw new Error("Production ADMIN_USERNAME must be 2-16 characters.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("Production ADMIN_PASSWORD must be 8-128 characters.");
  }

  return { email, username, password };
}

export async function ensureProductionAdmin(): Promise<void> {
  const config = readProductionAdminConfig();
  if (!config) return;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, config.email))
    .limit(1);

  if (existing) {
    if (existing.role !== "ADMIN") {
      await db
        .update(usersTable)
        .set({ role: "ADMIN", updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id));
      logger.info(
        { userId: existing.id, email: config.email },
        "Promoted configured Production admin without replacing account credentials",
      );
    }

    await ensureStarterCollection(existing.id);
    await ensureStartingShopCurrency(existing.id);
    return;
  }

  const [admin] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      email: config.email,
      nickname: config.username,
      passwordHash: await hashPassword(config.password),
      role: "ADMIN",
      currency: STARTING_CURRENCY,
    })
    .returning();

  if (!admin) {
    throw new Error("Production ADMIN bootstrap did not create an account.");
  }

  await ensureStarterCollection(admin.id);
  await ensureStartingShopCurrency(admin.id);
  logger.info(
    { userId: admin.id, email: config.email },
    "Created configured Production admin",
  );
}
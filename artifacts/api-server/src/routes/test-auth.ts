import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import {
  createAuthSession,
  hashPassword,
  type PublicUser,
} from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";

const router = Router();
const STARTING_CURRENCY = Math.max(0, Number.parseInt(process.env["STARTING_CURRENCY"] ?? "1000", 10) || 1000);

const TEST_ACCOUNTS = {
  USER: {
    email: "ko-test-user@localhost.test",
    nickname: "KO Test User",
    password: "ko-test-user-password",
  },
  ADMIN: {
    email: "ko-test-admin@localhost.test",
    nickname: "KO Test Admin",
    password: "ko-test-admin-password",
  },
} as const;

function enabled(): boolean {
  return process.env["NODE_ENV"] !== "production" && process.env["ENABLE_TEST_AUTH"] === "true";
}

function publicUser(user: typeof usersTable.$inferSelect): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    currency: user.currency,
    prismBalance: user.prismBalance,
  };
}

async function ensureTestAccount(role: keyof typeof TEST_ACCOUNTS) {
  const account = TEST_ACCOUNTS[role];
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, account.email)).limit(1);
  const user = existing
    ? (await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, existing.id)).returning())[0]
    : (await db.insert(usersTable).values({
      id: randomUUID(),
      email: account.email,
      nickname: account.nickname,
      passwordHash: await hashPassword(account.password),
      role,
      currency: STARTING_CURRENCY,
    }).returning())[0];

  if (!user) throw new Error("테스트 계정을 준비하지 못했습니다.");
  await ensureStarterCollection(user.id);
  return user;
}

router.post("/login", async (request, response) => {
  if (!enabled()) {
    response.status(404).json({ message: "Not found" });
    return;
  }

  const role = request.body?.role;
  if (role !== "USER" && role !== "ADMIN") {
    response.status(400).json({ message: "role은 USER 또는 ADMIN이어야 합니다." });
    return;
  }

  const user = await ensureTestAccount(role);
  await createAuthSession(user.id, response);
  response.json({ authenticated: true, user: publicUser(user) });
});

export { TEST_ACCOUNTS };
export default router;
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  clearLoginRateLimit,
  clearSessionCookie,
  createAuthSession,
  getAuthenticatedUser,
  hashPassword,
  invalidateAuthSession,
  isConfiguredAdminEmail,
  isLoginRateLimited,
  isValidEmail,
  isValidNickname,
  isValidPassword,
  normalizeEmail,
  promoteConfiguredAdmin,
  recordFailedLogin,
  verifyPassword,
} from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";

const router = Router();

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

router.post("/register", async (request, response) => {
  const email = normalizeEmail(readString(request.body?.email));
  const nickname = readString(request.body?.nickname).trim();
  const password = readString(request.body?.password);
  const passwordConfirmation = readString(request.body?.passwordConfirmation);

  if (!isValidEmail(email)) {
    response.status(400).json({ message: "이메일 형식을 확인해 주세요." });
    return;
  }
  if (!isValidNickname(nickname)) {
    response.status(400).json({ message: "닉네임은 2~16자로 입력해 주세요." });
    return;
  }
  if (!isValidPassword(password)) {
    response.status(400).json({ message: "비밀번호는 8~128자로 입력해 주세요." });
    return;
  }
  if (password !== passwordConfirmation) {
    response.status(400).json({ message: "비밀번호 확인이 일치하지 않습니다." });
    return;
  }

  const [duplicate] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.email, email), eq(usersTable.nickname, nickname)))
    .limit(1);
  if (duplicate) {
    response.status(409).json({ message: "이미 사용 중인 이메일 또는 닉네임입니다." });
    return;
  }

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        email,
        nickname,
        passwordHash: await hashPassword(password),
        role: isConfiguredAdminEmail(email) ? "ADMIN" : "USER",
      })
      .returning();
    if (!user) {
      response.status(500).json({ message: "계정을 만들지 못했습니다." });
      return;
    }
    await ensureStarterCollection(user.id);
    await createAuthSession(user.id, response);
    response.status(201).json({ authenticated: true, user: {
      id: user.id, email: user.email, nickname: user.nickname, role: user.role,
    } });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({ message: "이미 사용 중인 이메일 또는 닉네임입니다." });
      return;
    }
    throw error;
  }
});

router.post("/login", async (request, response) => {
  const email = normalizeEmail(readString(request.body?.email));
  const password = readString(request.body?.password);
  const genericError = "이메일 또는 비밀번호를 확인해 주세요.";

  if (!isValidEmail(email) || !isValidPassword(password)) {
    response.status(401).json({ message: genericError });
    return;
  }
  if (isLoginRateLimited(request, email)) {
    response.status(429).json({ message: "잠시 후 다시 시도해 주세요." });
    return;
  }

  const [foundUser] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = foundUser ? await promoteConfiguredAdmin(foundUser) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailedLogin(request, email);
    response.status(401).json({ message: genericError });
    return;
  }

  clearLoginRateLimit(request, email);
  await ensureStarterCollection(user.id);
  await createAuthSession(user.id, response);
  response.json({ authenticated: true, user: {
    id: user.id, email: user.email, nickname: user.nickname, role: user.role,
  } });
});

router.post("/logout", async (request, response) => {
  await invalidateAuthSession(request);
  clearSessionCookie(response);
  response.json({ authenticated: false });
});

router.get("/me", async (request, response) => {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    response.json({ authenticated: false, user: null });
    return;
  }
  await ensureStarterCollection(user.id);
  response.json({ authenticated: true, user });
});

export default router;
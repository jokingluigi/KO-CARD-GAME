import { randomUUID } from "node:crypto";
import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  AUTH_LOOKUP_TIMEOUT_MS,
  AuthDependencyTimeoutError,
  type AuthTraceStage,
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
  getPublicUser,
} from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";
import { logger } from "../lib/logger";
import { grantAccountStarterPacks, StarterPackConfigurationError } from "../lib/starter-pack-rewards";

const router = Router();
const STARTING_CURRENCY = Math.max(0, Number.parseInt(process.env["STARTING_CURRENCY"] ?? "1000", 10) || 1000);

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

router.post("/register", async (request, response): Promise<void> => {
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
    const passwordHash = await hashPassword(password);
    const user = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(usersTable)
        .values({
          id: randomUUID(),
          email,
          nickname,
          passwordHash,
          role: isConfiguredAdminEmail(email) ? "ADMIN" : "USER",
          currency: STARTING_CURRENCY,
        })
        .returning();
      if (!createdUser) throw new Error("계정을 만들지 못했습니다.");
      await grantAccountStarterPacks(createdUser.id, tx);
      return createdUser;
    });
    if (!user) {
      response.status(500).json({ message: "계정을 만들지 못했습니다." });
      return;
    }
    await ensureStarterCollection(user.id);
    await createAuthSession(user.id, response);
    response.status(201).json({ authenticated: true, user: await getPublicUser(user) });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({ message: "이미 사용 중인 이메일 또는 닉네임입니다." });
      return;
    }
    if (error instanceof StarterPackConfigurationError) {
      request.log.error({ err: error }, "Account signup starter pack configuration is invalid");
      response.status(503).json({ message: "회원가입 보상 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." });
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
  response.json({ authenticated: true, user: await getPublicUser(user) });
});

router.post("/logout", async (request, response) => {
  await invalidateAuthSession(request);
  clearSessionCookie(response);
  response.json({ authenticated: false });
});

router.get("/me", async (request, response) => {
  const requestStartedAt = Date.now();
  const trace = (stage: AuthTraceStage | "REQUEST_RECEIVED" | "AUTH_MIDDLEWARE_ENTER" | "AUTH_MIDDLEWARE_EXIT" | "RESPONSE_SENT", durationMs = Date.now() - requestStartedAt) => {
    logger.info({ authStage: stage, durationMs }, `auth/me ${stage}`);
  };
  trace("REQUEST_RECEIVED", 0);
  trace("AUTH_MIDDLEWARE_ENTER", 0);
  try {
    const user = await getAuthenticatedUser(request, {
      timeoutMs: AUTH_LOOKUP_TIMEOUT_MS,
      onStage: trace,
    });
    trace("AUTH_MIDDLEWARE_EXIT");
    if (!user) {
      response.json({ authenticated: false, user: null });
      trace("RESPONSE_SENT");
      return;
    }
    // A session check must not wait for collection writes. Login, registration,
    // and the collection/packs endpoints already provision starter cards.
    response.json({ authenticated: true, user });
    trace("RESPONSE_SENT");
  } catch (error) {
    trace("AUTH_MIDDLEWARE_EXIT");
    if (error instanceof AuthDependencyTimeoutError) {
      if (response.headersSent) return;
      response.status(503).json({ message: "인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." });
      trace("RESPONSE_SENT");
      return;
    }
    logger.error({ err: error, durationMs: Date.now() - requestStartedAt }, "auth/me failed");
    if (response.headersSent) return;
    response.status(500).json({ message: "인증 상태를 확인하지 못했습니다." });
    trace("RESPONSE_SENT");
  }
});

export default router;

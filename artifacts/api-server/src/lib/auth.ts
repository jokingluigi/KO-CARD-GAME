import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, sessionsTable, usersTable, type UserRecord } from "@workspace/db";
import { ensureStartingShopCurrency } from "./shop-currency";
import { isTestAccountUser, TEST_ACCOUNT_UNLIMITED_BALANCE } from "./test-account";

export const AUTH_SESSION_COOKIE = "ko_session";
export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export type PublicUser = Pick<UserRecord, "id" | "email" | "nickname" | "role" | "currency"> & {
  currencyBalance: number;
  prismBalance: number;
  isTestAccount: boolean;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicUser;
    }
  }
}

function publicUser(user: UserRecord, currencyBalance = user.currencyBalance): PublicUser {
  const testAccount = isTestAccountUser(user);
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    currency: user.currency,
    currencyBalance: testAccount ? TEST_ACCOUNT_UNLIMITED_BALANCE : currencyBalance,
    prismBalance: testAccount ? TEST_ACCOUNT_UNLIMITED_BALANCE : user.prismBalance,
    isTestAccount: testAccount,
  };
}

export async function getPublicUser(user: UserRecord): Promise<PublicUser> {
  const currencyBalance = await ensureStartingShopCurrency(user.id);
  return publicUser(user, currencyBalance ?? user.currencyBalance);
}

function getCookie(request: Request, name: string): string | null {
  return getCookieFromHeader(request.headers.cookie, name);
}

export function getCookieFromHeader(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function configuredAdminEmail(): string | null {
  const configured = process.env["ADMIN_EMAIL"] ?? process.env["ADMIN_USERNAME"];
  if (!configured) return null;
  return normalizeEmail(configured);
}

export function isConfiguredAdminEmail(email: string): boolean {
  const adminEmail = configuredAdminEmail();
  return Boolean(adminEmail && adminEmail === normalizeEmail(email));
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidNickname(nickname: string): boolean {
  const length = Array.from(nickname.trim()).length;
  return length >= 2 && length <= 16;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

function deriveKey(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, rawN, rawR, rawP, salt, encodedKey] = encoded.split("$");
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!salt || !encodedKey || !Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedKey, "base64url");
    const actual = await deriveKey(password, salt, expected.length, { N, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function setSessionCookie(response: Response, token: string): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${AUTH_SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearSessionCookie(response: Response): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${AUTH_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  );
}

export async function createAuthSession(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessionsTable).values({
    id: randomUUID(),
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000),
  });
  setSessionCookie(response, token);
}

export async function getAuthenticatedUser(request: Request): Promise<PublicUser | null> {
  const token = getCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return null;

  const [session] = await db
    .select({
      userId: sessionsTable.userId,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, hashSessionToken(token)), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
  return user ? await getPublicUser(user) : null;
}

export async function getAuthenticatedUserFromSessionToken(token: string): Promise<PublicUser | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, hashSessionToken(token)), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
  return user ? getPublicUser(user) : null;
}

export async function invalidateAuthSession(request: Request): Promise<void> {
  const token = getCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return;
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashSessionToken(token)));
}

export async function promoteConfiguredAdmin(user: UserRecord): Promise<UserRecord> {
  if (user.role === "ADMIN" || !isConfiguredAdminEmail(user.email)) return user;
  const [updated] = await db
    .update(usersTable)
    .set({ role: "ADMIN", updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  return updated ?? user;
}

function rateLimitKey(request: Request, email: string): string {
  return `${request.ip}:${email}`;
}

export function isLoginRateLimited(request: Request, email: string): boolean {
  const key = rateLimitKey(request, email);
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function recordFailedLogin(request: Request, email: string): void {
  const key = rateLimitKey(request, email);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function clearLoginRateLimit(request: Request, email: string): void {
  loginAttempts.delete(rateLimitKey(request, email));
}

export async function attachAuthUser(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    request.authUser = await getAuthenticatedUser(request) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(request: Request, response: Response): boolean {
  if (request.authUser?.role === "ADMIN") return true;
  response.status(request.authUser ? 403 : 401).json({
    message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다.",
  });
  return false;
}
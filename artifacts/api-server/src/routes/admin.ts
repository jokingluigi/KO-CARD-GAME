import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { cardsTable, db } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const ADMIN_SESSION_COOKIE = "ko_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

type AdminSessionPayload = {
  subject: "admin";
  username: string;
  expiresAt: number;
};

const CARD_TYPES = ["WRESTLER", "TECHNIQUE"] as const;
const CARD_STATUSES = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
const CARD_KEYWORDS = [
  "RUSH",
  "SURPRISE",
  "TAUNT",
  "DODGE",
  "MULTI_STRIKE",
] as const;

type CardInput = {
  name: string;
  cardType: (typeof CARD_TYPES)[number];
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: (typeof CARD_KEYWORDS)[number][];
  isToken: boolean;
  isChampionToken: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
};

router.use((request, response, next) => {
  delete request.headers["if-none-match"];
  delete request.headers["if-modified-since"];
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  next();
});

function configuredSecret(): string | null {
  return process.env["SESSION_SECRET"] ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(username: string): string | null {
  const secret = configuredSecret();
  if (!secret) {
    return null;
  }

  const payload: AdminSessionPayload = {
    subject: "admin",
    username,
    expiresAt: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function cookieValue(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));

  return cookie?.slice(`${ADMIN_SESSION_COOKIE}=`.length) ?? null;
}

function isValidSession(request: Request): boolean {
  const secret = configuredSecret();
  const configuredUsername = process.env["ADMIN_USERNAME"];
  const configuredPassword = process.env["ADMIN_PASSWORD"];
  const token = cookieValue(request);
  if (!secret || !configuredUsername || !configuredPassword || !token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    return (
      payload.subject === "admin" &&
      typeof payload.username === "string" &&
      safeEqual(payload.username, configuredUsername) &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function setSessionCookie(response: Response, token: string): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL_SECONDS}${secure}`,
  );
}

function clearSessionCookie(response: Response): void {
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

function requireAdmin(request: Request, response: Response): boolean {
  if (isValidSession(request)) {
    return true;
  }

  response.status(401).json({ message: "관리자 인증이 필요합니다." });
  return false;
}

function parseCardInput(value: unknown): CardInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const effectId =
    typeof input.effectId === "string" && input.effectId.trim()
      ? input.effectId.trim()
      : null;
  const validInteger = (candidate: unknown) =>
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 0 &&
    candidate <= 999;

  if (
    !name ||
    name.length > 120 ||
    !CARD_TYPES.includes(input.cardType as (typeof CARD_TYPES)[number]) ||
    !validInteger(input.cost) ||
    !validInteger(input.attack) ||
    !validInteger(input.health) ||
    typeof input.isToken !== "boolean" ||
    typeof input.isChampionToken !== "boolean" ||
    (input.isChampionToken && !input.isToken) ||
    !Array.isArray(input.keywords) ||
    !input.keywords.every((keyword) =>
      CARD_KEYWORDS.includes(keyword as (typeof CARD_KEYWORDS)[number]),
    ) ||
    !input.effectConfig ||
    typeof input.effectConfig !== "object" ||
    Array.isArray(input.effectConfig)
  ) {
    return null;
  }

  return {
    name,
    cardType: input.cardType as CardInput["cardType"],
    cost: input.cost as number,
    attack: input.attack as number,
    health: input.health as number,
    text,
    keywords: [...new Set(input.keywords)] as CardInput["keywords"],
    isToken: input.isToken,
    isChampionToken: input.isChampionToken,
    effectId,
    effectConfig: input.effectConfig as Record<string, unknown>,
  };
}

function firstParam(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

router.post("/login", (request, response) => {
  const configuredUsername = process.env["ADMIN_USERNAME"];
  const configuredPassword = process.env["ADMIN_PASSWORD"];
  const { username, password } = request.body as {
    username?: unknown;
    password?: unknown;
  };

  if (!configuredUsername || !configuredPassword || !configuredSecret()) {
    response
      .status(503)
      .json({ message: "관리자 인증 서버 설정이 완료되지 않았습니다." });
    return;
  }

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !safeEqual(username, configuredUsername) ||
    !safeEqual(password, configuredPassword)
  ) {
    response.status(401).json({ message: "관리자 계정 정보가 올바르지 않습니다." });
    return;
  }

  const token = createSessionToken(configuredUsername);
  if (!token) {
    response
      .status(503)
      .json({ message: "관리자 인증 서버 설정이 완료되지 않았습니다." });
    return;
  }

  setSessionCookie(response, token);
  response.json({ authenticated: true });
});

router.get("/session", (request, response) => {
  if (!isValidSession(request)) {
    response.json({ authenticated: false });
    return;
  }

  response.json({ authenticated: true });
});

router.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  response.json({ authenticated: false });
});

router.get("/cards", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const search = firstParam(request.query.search)?.trim();
  const cardType = firstParam(request.query.cardType);
  const status = firstParam(request.query.status);
  const tokenKind = firstParam(request.query.tokenKind);
  const filters = [];

  if (search) filters.push(ilike(cardsTable.name, `%${search}%`));
  if (CARD_TYPES.includes(cardType as (typeof CARD_TYPES)[number])) {
    filters.push(eq(cardsTable.cardType, cardType as string));
  }
  if (CARD_STATUSES.includes(status as (typeof CARD_STATUSES)[number])) {
    filters.push(eq(cardsTable.status, status as string));
  }
  if (tokenKind === "TOKEN") {
    filters.push(eq(cardsTable.isToken, true));
  } else if (tokenKind === "CHAMPION_TOKEN") {
    filters.push(eq(cardsTable.isChampionToken, true));
  } else if (tokenKind === "STANDARD") {
    filters.push(eq(cardsTable.isToken, false));
  }

  const cards = await db
    .select()
    .from(cardsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(cardsTable.name));

  response.json({ cards });
});

router.post("/cards", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const input = parseCardInput(request.body);
  if (!input) {
    response.status(400).json({ message: "카드 입력값을 확인해 주세요." });
    return;
  }

  const [card] = await db
    .insert(cardsTable)
    .values({
      id: randomUUID(),
      ...input,
      status: "DRAFT",
      version: 1,
    })
    .returning();

  response.status(201).json({ card });
});

router.patch("/cards/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const input = parseCardInput(request.body);
  const id = firstParam(request.params.id);
  if (!id || !input) {
    response.status(400).json({ message: "카드 입력값을 확인해 주세요." });
    return;
  }

  const [card] = await db
    .update(cardsTable)
    .set({
      ...input,
      version: sql`${cardsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(cardsTable.id, id))
    .returning();

  if (!card) {
    response.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }

  response.json({ card });
});

router.post("/cards/:id/duplicate", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const id = firstParam(request.params.id);
  if (!id) {
    response.status(400).json({ message: "카드 ID가 올바르지 않습니다." });
    return;
  }

  const [source] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.id, id))
    .limit(1);
  if (!source) {
    response.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }

  const [card] = await db
    .insert(cardsTable)
    .values({
      ...source,
      id: randomUUID(),
      name: `${source.name} Copy`,
      status: "DRAFT",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  response.status(201).json({ card });
});

router.post("/cards/:id/status", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const id = firstParam(request.params.id);
  const status =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>).status
      : null;
  if (
    !id ||
    !CARD_STATUSES.includes(status as (typeof CARD_STATUSES)[number])
  ) {
    response.status(400).json({ message: "카드 상태가 올바르지 않습니다." });
    return;
  }

  const [card] = await db
    .update(cardsTable)
    .set({
      status: status as (typeof CARD_STATUSES)[number],
      version: sql`${cardsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(cardsTable.id, id))
    .returning();

  if (!card) {
    response.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }

  response.json({ card });
});

router.get("/", (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  response.json({
    authenticated: true,
    modules: [{ id: "cards", label: "카드 관리", available: true }],
  });
});

export default router;
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { cardsTable, db, mechanicRequestsTable } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { CardImageStorage } from "../lib/object-storage";
import {
  isPendingMechanicRequestConflict,
  prepareMechanicRequest,
} from "../lib/mechanic-request-service";
import { prepareReplitAgentPrompt } from "../lib/replit-agent-prompt";
import { analyzeEffectText, effectLibrary, isStructuredEffects } from "../lib/structured-effects";

const router: IRouter = Router();
const cardImageStorage = new CardImageStorage();

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
  imageAssetId: string | null;
  imageUrl: string | null;
  imageUploadToken: string | null;
};

const CARD_IMAGE_TYPES = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
} as const;
const configuredMaxCardImageSize = Number(
  process.env["MAX_CARD_IMAGE_SIZE"] ?? 5 * 1024 * 1024,
);
const MAX_CARD_IMAGE_SIZE =
  Number.isFinite(configuredMaxCardImageSize) &&
  configuredMaxCardImageSize > 0
    ? Math.floor(configuredMaxCardImageSize)
    : 5 * 1024 * 1024;

function imageUrlFor(assetId: string) {
  return `/api/storage${assetId}`;
}

const PENDING_IMAGE_TTL_MS = 2 * 60 * 60 * 1000;

function signImageAsset(assetId: string, expiresAt: number) {
  const secret = configuredSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const signature = createHmac("sha256", secret)
    .update(`card-image:${assetId}:${expiresAt}`)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

function validImageAssetToken(assetId: string, token: string | null) {
  if (!token) return false;
  const separator = token.indexOf(".");
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (
    separator < 1 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return false;
  }
  const expected = Buffer.from(signImageAsset(assetId, expiresAt).slice(separator + 1));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function imageContentType(assetId: string) {
  const extension = assetId.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
}

async function validNewImageAsset(assetId: string, token: string | null) {
  const contentType = imageContentType(assetId);
  return Boolean(
    contentType &&
      validImageAssetToken(assetId, token) &&
      (await cardImageStorage.verifyImage(
        assetId,
        contentType,
        MAX_CARD_IMAGE_SIZE,
      )),
  );
}

async function removeImageIfUnreferenced(assetId: string) {
  const [reference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardsTable)
    .where(eq(cardsTable.imageAssetId, assetId));
  if ((reference?.count ?? 0) === 0) {
    await cardImageStorage.remove(assetId);
  }
}

async function cleanupAbandonedImages() {
  const stale = await cardImageStorage.staleUploads(
    new Date(Date.now() - PENDING_IMAGE_TTL_MS),
  );
  await Promise.all(stale.map(removeImageIfUnreferenced));
}

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

function adminSessionUsername(request: Request): string | null {
  if (!isValidSession(request)) return null;
  const token = cookieValue(request);
  if (!token) return null;
  try {
    const [encodedPayload] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload ?? "", "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;
    return typeof payload.username === "string" ? payload.username : null;
  } catch {
    return null;
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

export function requireAdmin(request: Request, response: Response): boolean {
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
  const explicitEffectId =
    typeof input.effectId === "string" && input.effectId.trim()
      ? input.effectId.trim()
      : null;
  const effectId = explicitEffectId;
  const imageAssetId =
    typeof input.imageAssetId === "string" && input.imageAssetId
      ? input.imageAssetId
      : null;
  const imageUrl =
    typeof input.imageUrl === "string" && input.imageUrl ? input.imageUrl : null;
  const imageUploadToken =
    typeof input.imageUploadToken === "string" ? input.imageUploadToken : null;
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
    || (effectId === "STRUCTURED_EFFECTS_V1" && !isStructuredEffects(input.effectConfig))
    || (imageAssetId === null) !== (imageUrl === null)
    || (imageAssetId !== null &&
      !imageAssetId.startsWith("/objects/uploads/card-images/"))
    || (imageUrl !== null && !imageUrl.startsWith("/api/storage/objects/"))
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
    imageAssetId,
    imageUrl: imageAssetId ? imageUrlFor(imageAssetId) : null,
    imageUploadToken,
  };
}

function firstParam(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

router.post("/effects/analyze", (request, response) => {
  if (!requireAdmin(request, response)) return;
  const text = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>).text : null;
  if (typeof text !== "string" || text.length > 2000) {
    response.status(400).json({ message: "효과 텍스트를 확인해 주세요." }); return;
  }
  response.json(analyzeEffectText(text));
});

router.get("/effects/library", (request, response) => {
  if (!requireAdmin(request, response)) return;
  response.json(effectLibrary());
});

router.post("/mechanic-requests", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
  const originalCardText =
    typeof body.originalCardText === "string" ? body.originalCardText.trim() : "";
  const requestedBy = adminSessionUsername(request);
  if (!originalCardText || originalCardText.length > 2000 || !requestedBy) {
    response.status(400).json({ message: "효과 텍스트를 확인해 주세요." });
    return;
  }

  // Client analysis is UX-only. Re-run the current analyzer/library on server.
  const prepared = prepareMechanicRequest(
    originalCardText,
    requestedBy,
    randomUUID(),
  );
  if (prepared.kind === "supported") {
    response.status(409).json({
      message: "현재 Effect Library로 구현할 수 있습니다. 다시 분석한 뒤 Structured Effect를 사용해 주세요.",
      analysis: prepared.analysis,
    });
    return;
  }
  if (prepared.kind === "analysis_failure") {
    response.status(422).json({
      message: "효과 의도를 충분히 분석하지 못해 새 메커니즘 요청을 만들 수 없습니다.",
      analysis: prepared.analysis,
    });
    return;
  }

  try {
    const [mechanicRequest] = await db
      .insert(mechanicRequestsTable)
      .values(prepared.values)
      .returning();
    response.status(201).json({ mechanicRequest });
  } catch (error) {
    if (!isPendingMechanicRequestConflict(error)) throw error;

    const [duplicate] = await db
      .select()
      .from(mechanicRequestsTable)
      .where(
        and(
          eq(mechanicRequestsTable.originalCardText, originalCardText),
          eq(mechanicRequestsTable.status, "PENDING"),
        ),
      )
      .limit(1);
    if (!duplicate) throw error;
    response.status(409).json({
      message: "같은 효과의 대기 중인 요청이 이미 있습니다.",
      mechanicRequest: duplicate,
    });
  }
});

router.get("/mechanic-requests", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const mechanicRequests = await db
    .select()
    .from(mechanicRequestsTable)
    .orderBy(asc(mechanicRequestsTable.createdAt));
  response.json({ mechanicRequests });
});

router.get("/mechanic-requests/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) {
    response.status(400).json({ message: "요청 ID가 올바르지 않습니다." });
    return;
  }
  const [mechanicRequest] = await db
    .select()
    .from(mechanicRequestsTable)
    .where(eq(mechanicRequestsTable.id, id))
    .limit(1);
  if (!mechanicRequest) {
    response.status(404).json({ message: "메커니즘 요청을 찾을 수 없습니다." });
    return;
  }
  response.json({ mechanicRequest });
});

router.post("/mechanic-requests/:id/replit-prompt", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) {
    response.status(400).json({ message: "요청 ID가 올바르지 않습니다." });
    return;
  }
  const [mechanicRequest] = await db.select().from(mechanicRequestsTable)
    .where(eq(mechanicRequestsTable.id, id)).limit(1);
  if (!mechanicRequest) {
    response.status(404).json({ message: "메커니즘 요청을 찾을 수 없습니다." });
    return;
  }
  // Persisted text is the only input; all interpretation and library data are live.
  const analysis = analyzeEffectText(mechanicRequest.originalCardText);
  const promptDecision = prepareReplitAgentPrompt(mechanicRequest.originalCardText, analysis, effectLibrary());
  if (promptDecision.kind === "supported") {
    response.status(409).json({ message: "이제 현재 Effect Library로 구현할 수 있습니다.", analysis });
    return;
  }
  if (promptDecision.kind === "analysis_failure") {
    response.status(422).json({ message: "효과 의도를 충분히 분석하지 못했습니다.", analysis });
    return;
  }
  response.json({ mechanicRequestId: mechanicRequest.id, analysis, prompt: promptDecision.prompt });
});

router.post("/mechanic-requests/replit-prompt", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const originalCardText = typeof body.originalCardText === "string"
    ? body.originalCardText.trim() : "";
  if (!originalCardText || originalCardText.length > 2000) {
    response.status(400).json({ message: "효과 텍스트를 확인해 주세요." });
    return;
  }
  const requests = await db.select().from(mechanicRequestsTable)
    .where(eq(mechanicRequestsTable.originalCardText, originalCardText))
    .orderBy(asc(mechanicRequestsTable.createdAt));
  const mechanicRequest = requests.at(-1);
  if (!mechanicRequest) {
    response.status(404).json({ message: "먼저 메커니즘 요청을 만들어 주세요." });
    return;
  }
  const analysis = analyzeEffectText(mechanicRequest.originalCardText);
  const promptDecision = prepareReplitAgentPrompt(mechanicRequest.originalCardText, analysis, effectLibrary());
  if (promptDecision.kind === "supported") {
    response.status(409).json({ message: "이제 현재 Effect Library로 구현할 수 있습니다.", analysis });
    return;
  }
  if (promptDecision.kind === "analysis_failure") {
    response.status(422).json({ message: "효과 의도를 충분히 분석하지 못했습니다.", analysis });
    return;
  }
  response.json({ mechanicRequestId: mechanicRequest.id, analysis, prompt: promptDecision.prompt });
});

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
    !safeEqual(username.trim().toUpperCase(), configuredUsername.trim().toUpperCase()) ||
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

router.post(
  "/cards/images/upload-url",
  async (request, response): Promise<void> => {
    if (!requireAdmin(request, response)) return;
    void cleanupAbandonedImages().catch((error) => {
      request.log.warn({ err: error }, "Failed to clean abandoned card images");
    });
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const name = typeof body.name === "string" ? body.name : "";
    const contentType =
      typeof body.contentType === "string" ? body.contentType : "";
    const size = typeof body.size === "number" ? body.size : 0;
    const extension = name.toLowerCase().split(".").pop() ?? "";
    const validExtensions =
      CARD_IMAGE_TYPES[contentType as keyof typeof CARD_IMAGE_TYPES];
    if (
      !validExtensions ||
      !(validExtensions as readonly string[]).includes(extension) ||
      !Number.isInteger(size) ||
      size <= 0 ||
      size > MAX_CARD_IMAGE_SIZE
    ) {
      response.status(400).json({
        message: `PNG, JPG, JPEG, WEBP 파일만 업로드할 수 있으며 최대 크기는 ${Math.floor(MAX_CARD_IMAGE_SIZE / 1024 / 1024)}MB입니다.`,
      });
      return;
    }
    const upload = await cardImageStorage.createUpload(extension);
    response.json({
      ...upload,
      maxSize: MAX_CARD_IMAGE_SIZE,
      contentType,
    });
  },
);

router.post(
  "/cards/images/complete",
  async (request, response): Promise<void> => {
    if (!requireAdmin(request, response)) return;
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const objectPath =
      typeof body.objectPath === "string" ? body.objectPath : "";
    const contentType =
      typeof body.contentType === "string" ? body.contentType : "";
    if (
      !objectPath.startsWith("/objects/uploads/card-images/") ||
      !(contentType in CARD_IMAGE_TYPES)
    ) {
      response.status(400).json({ message: "이미지 정보가 올바르지 않습니다." });
      return;
    }
    const valid = await cardImageStorage.verifyImage(
      objectPath,
      contentType,
      MAX_CARD_IMAGE_SIZE,
    );
    if (!valid) {
      await cardImageStorage.remove(objectPath);
      response.status(400).json({ message: "이미지 파일 형식을 확인할 수 없습니다." });
      return;
    }
    response.json({
      imageAssetId: objectPath,
      imageUrl: `/api/storage${objectPath}`,
      imageUploadToken: signImageAsset(
        objectPath,
        Date.now() + PENDING_IMAGE_TTL_MS,
      ),
    });
  },
);

router.post(
  "/cards/images/discard",
  async (request, response): Promise<void> => {
    if (!requireAdmin(request, response)) return;
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const imageAssetId =
      typeof body.imageAssetId === "string" ? body.imageAssetId : "";
    const imageUploadToken =
      typeof body.imageUploadToken === "string" ? body.imageUploadToken : null;
    if (
      !imageAssetId.startsWith("/objects/uploads/card-images/") ||
      !validImageAssetToken(imageAssetId, imageUploadToken)
    ) {
      response.status(400).json({ message: "이미지 정보가 올바르지 않습니다." });
      return;
    }
    await removeImageIfUnreferenced(imageAssetId);
    response.status(204).end();
  },
);

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

router.get("/cards/:id/test", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) {
    response.status(400).json({ message: "카드 ID가 올바르지 않습니다." });
    return;
  }
  const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, id)).limit(1);
  if (!card || card.status === "DISABLED" || card.cardType !== "WRESTLER") {
    response.status(404).json({ message: "테스트할 수 있는 선수를 찾을 수 없습니다." });
    return;
  }
  response.json({ card });
});

router.post("/cards", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const input = parseCardInput(request.body);
  if (!input) {
    response.status(400).json({ message: "카드 입력값을 확인해 주세요." });
    return;
  }
  if (
    input.imageAssetId &&
    !(await validNewImageAsset(input.imageAssetId, input.imageUploadToken))
  ) {
    response.status(400).json({ message: "검증된 이미지 업로드 정보가 필요합니다." });
    return;
  }
  const { imageUploadToken: _imageUploadToken, ...cardValues } = input;

  const [card] = await db
    .insert(cardsTable)
    .values({
      id: randomUUID(),
      ...cardValues,
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

  const [existing] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.id, id))
    .limit(1);
  if (!existing) {
    response.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }
  if (
    input.imageAssetId &&
    input.imageAssetId !== existing.imageAssetId &&
    !(await validNewImageAsset(input.imageAssetId, input.imageUploadToken))
  ) {
    response.status(400).json({ message: "검증된 이미지 업로드 정보가 필요합니다." });
    return;
  }
  const { imageUploadToken: _imageUploadToken, ...cardValues } = input;

  const [card] = await db
    .update(cardsTable)
    .set({
      ...cardValues,
      version: sql`${cardsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(cardsTable.id, id))
    .returning();

  if (existing.imageAssetId && existing.imageAssetId !== input.imageAssetId) {
    await removeImageIfUnreferenced(existing.imageAssetId);
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
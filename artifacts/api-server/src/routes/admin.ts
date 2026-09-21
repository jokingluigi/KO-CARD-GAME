import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  cardsTable,
  cardFrameDefinitionsTable,
  championsTable,
  db,
  gameMediaTable,
  mechanicRequestsTable,
  shopListingsTable,
} from "@workspace/db";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { parseCardTags } from "@workspace/api-zod";
import {
  AudioStorage,
  BackgroundImageStorage,
  CardImageStorage,
  GameAttackStorage,
  GameBgmStorage,
} from "../lib/object-storage";
import {
  isPendingMechanicRequestConflict,
  prepareMechanicRequest,
} from "../lib/mechanic-request-service";
import { prepareReplitAgentPrompt } from "../lib/replit-agent-prompt";
import {
  createChampionFullPrompt,
  dedupeUnsupportedMechanics,
  type ChampionFullPromptData,
  type ChampionFullSection,
  type ChampionFullSectionStatus,
  type ChampionFullToken,
} from "../lib/champion-full-prompt";
import {
  collectUnifiedMechanics,
  createUnifiedEffectPrompt,
  type UnifiedEffectPromptData,
  type UnifiedEntry,
} from "../lib/unified-effect-prompt";
import { analyzeChampionQuestText } from "../lib/champion-quest-analysis";
import {
  analyzeEffectText,
  effectLibrary,
  isEffectScriptConfig,
  isChampionQuestRewardEffects,
  isStructuredEffects,
  type Analysis,
  type CardReferenceCandidate,
  type Trigger,
} from "../lib/structured-effects";
import {
  countStructuredEffectUsage,
  prepareCompletionApply,
  validateMechanicCompletion,
} from "../lib/mechanic-completion-service";
import {
  EffectAiError,
  generateEffectDraft,
  type EffectAiContext,
} from "../lib/admin-effect-ai";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();
const cardImageStorage = new CardImageStorage();
const backgroundImageStorage = new BackgroundImageStorage();
const audioStorage = new AudioStorage();
const gameBgmStorage = new GameBgmStorage();
const gameAttackStorage = new GameAttackStorage();

const ADMIN_SESSION_COOKIE = "ko_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

type AdminSessionPayload = {
  subject: "admin";
  username: string;
  expiresAt: number;
};

const CARD_TYPES = ["WRESTLER", "TECHNIQUE"] as const;
const CARD_RARITIES = ["NORMAL", "LEGENDARY", "CHAMPION", "TOKEN"] as const;
const CARD_STATUSES = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
const CHAMPION_STATUSES = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
const CARD_KEYWORDS = [
  "RUSH",
  "SURPRISE",
  "TAUNT",
  "DODGE",
  "MULTI_STRIKE",
] as const;
const IMAGE_DISPLAY_MODES = ["COVER", "CONTAIN", "CUSTOM"] as const;
const GAME_MEDIA_TYPES = [
  "BACKGROUND",
  "BGM",
  "LIGHT_ATTACK",
  "NORMAL_ATTACK",
  "HEAVY_ATTACK",
  "VERY_HEAVY_ATTACK",
] as const;
const CARD_FRAME_SCALE_RANGE = { min: 0.75, max: 1.5 };
const CARD_FRAME_OFFSET_RANGE = { min: -15, max: 15 };

type CardInput = {
  name: string;
  cardType: (typeof CARD_TYPES)[number];
  rarity: (typeof CARD_RARITIES)[number];
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: (typeof CARD_KEYWORDS)[number][];
  tags: string[];
  isToken: boolean;
  isChampionToken: boolean;
  isStarterGrant: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageDisplayMode: (typeof IMAGE_DISPLAY_MODES)[number];
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  imageUploadToken: string | null;
  entranceAudioAssetId: string | null;
  entranceAudioUrl: string | null;
  entranceAudioVolume: number;
  entranceAudioEnabled: boolean;
  entranceAudioUploadToken: string | null;
};

type ChampionInput = {
  name: string; description: string; imageAssetId: string | null; imageUrl: string | null;
  imageUploadToken: string | null;
  imageDisplayMode: (typeof IMAGE_DISPLAY_MODES)[number];
  imageScale: number; imagePositionX: number; imagePositionY: number;
  questCompletedPortraitEnabled: boolean;
  questCompletedPortraitAssetId: string | null; questCompletedPortraitUrl: string | null;
  questCompletedPortraitUploadToken: string | null;
  maxHealth: number; abilityName: string; abilityCost: number; abilityText: string;
  abilityEffects: Record<string, unknown>; hasQuest: boolean; questName: string | null;
  questText: string | null; questCondition: Record<string, unknown> | null;
  questProgressRequired: number | null; questRewardText: string | null;
  questRewardEffects: Record<string, unknown> | null; upgradedAbilityName: string | null;
  upgradedAbilityCost: number | null; upgradedAbilityText: string | null;
  upgradedAbilityEffects: Record<string, unknown> | null; championTokenDefinitionId: string | null;
  isStarterGrant: boolean;
  abilityAudioAssetId: string | null; abilityAudioUrl: string | null; abilityAudioVolume: number;
  questCompleteAudioAssetId: string | null; questCompleteAudioUrl: string | null;
  questCompleteAudioVolume: number; questCompleteAudioEnabled: boolean;
  questCompleteAudioUploadToken: string | null;
};

function parseChampionInput(value: unknown): ChampionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = (key: string, required = false) => {
    const result = typeof input[key] === "string" ? input[key].trim() : "";
    return required || result ? result : null;
  };
  const integer = (key: string, min: number, max: number, nullable = false) => {
    const rawValue = input[key];
    if (nullable && (rawValue === null || rawValue === "" || rawValue === undefined)) return null;
    const value = typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string" && rawValue.trim() ? Number(rawValue) : Number.NaN;
    return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
  };
  const object = (key: string, nullable = false) => {
    const value = input[key];
    if (nullable && (value === null || value === undefined)) return null;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  };
  const name = text("name", true);
  const abilityName = text("abilityName", true);
  const maxHealth = integer("maxHealth", 1, 999);
  const abilityCost = integer("abilityCost", 0, 999);
  const abilityAudioVolume = integer("abilityAudioVolume", 0, 100);
  const questCompleteAudioVolume = integer("questCompleteAudioVolume", 0, 100) ?? 100;
  const questCompleteAudioAssetId = text("questCompleteAudioAssetId");
  const questCompleteAudioUrl = text("questCompleteAudioUrl");
  const questCompleteAudioEnabled = input.questCompleteAudioEnabled === true;
  const questCompleteAudioUploadToken = typeof input.questCompleteAudioUploadToken === "string"
    ? input.questCompleteAudioUploadToken : null;
  const abilityEffects = object("abilityEffects");
  const hasQuest = input.hasQuest === true;
  const rawQuestCondition = object("questCondition", true);
  const questProgressInput = integer("questProgressRequired", 1, 999, true);
  const conditionRequired = rawQuestCondition && typeof rawQuestCondition.required === "number" &&
    Number.isInteger(rawQuestCondition.required) && rawQuestCondition.required >= 1 &&
    rawQuestCondition.required <= 999 ? rawQuestCondition.required : null;
  const questProgressRequired = questProgressInput ?? conditionRequired;
  const questCondition = hasQuest && rawQuestCondition && questProgressRequired !== null
    ? { ...rawQuestCondition, required: questProgressRequired }
    : hasQuest ? rawQuestCondition : null;
  const upgradedAbilityCost = integer("upgradedAbilityCost", 0, 999, true);
  const questCompletedPortraitEnabled = input.questCompletedPortraitEnabled === true;
  const normalizeAssetPair = (
    assetId: string | null,
    url: string | null,
    assetPrefix: string,
  ) => {
    if (assetId?.startsWith(assetPrefix)) {
      return { assetId, url: `/api/storage${assetId}` };
    }
    if (url?.startsWith("/api/storage/objects/")) {
      return { assetId: url.slice("/api/storage".length), url };
    }
    return { assetId, url };
  };
  const imagePair = normalizeAssetPair(
    text("imageAssetId"),
    text("imageUrl"),
    "/objects/uploads/card-images/",
  );
  const imageAssetId = imagePair.assetId;
  const imageUrl = imagePair.url;
  const imageUploadToken = text("imageUploadToken");
  const imageDisplayMode = IMAGE_DISPLAY_MODES.includes(input.imageDisplayMode as (typeof IMAGE_DISPLAY_MODES)[number])
    ? input.imageDisplayMode as (typeof IMAGE_DISPLAY_MODES)[number]
    : "COVER";
  const decimal = (key: string, fallback: number, min: number, max: number) => {
    const rawValue = input[key];
    const value = typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string" && rawValue.trim() ? Number(rawValue) : Number.NaN;
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const imageScale = decimal("imageScale", 1, 0.5, 2);
  const imagePositionX = decimal("imagePositionX", 50, 0, 100);
  const imagePositionY = decimal("imagePositionY", 50, 0, 100);
  const completedPortraitPair = normalizeAssetPair(
    text("questCompletedPortraitAssetId"),
    text("questCompletedPortraitUrl"),
    "/objects/uploads/card-images/",
  );
  const questCompletedPortraitAssetId = completedPortraitPair.assetId;
  const questCompletedPortraitUrl = completedPortraitPair.url;
  const questCompletedPortraitUploadToken = text("questCompletedPortraitUploadToken");
  const isStarterGrant = input.isStarterGrant === true;
  const validEffects = (effects: Record<string, unknown> | null | undefined, championReward = false) =>
    effects === null || effects === undefined || !("effects" in effects) ||
    isEffectScriptConfig(effects) ||
    (championReward ? isChampionQuestRewardEffects(effects) : isStructuredEffects(effects));
  if (!name || name.length > 120 || !abilityName || abilityName.length > 120 ||
      maxHealth == null || abilityCost == null || abilityAudioVolume == null ||
      questCompleteAudioVolume == null ||
      !abilityEffects || typeof input.hasQuest !== "boolean" ||
      questProgressRequired === undefined || upgradedAbilityCost === undefined ||
       !validEffects(abilityEffects) || !validEffects(object("questRewardEffects", true), true) ||
        !validEffects(object("upgradedAbilityEffects", true))) return null;
  if (
    (imageAssetId === null) !== (imageUrl === null) ||
    (imageAssetId !== null &&
      !imageAssetId.startsWith("/objects/uploads/card-images/")) ||
    (imageUrl !== null &&
      !imageUrl.startsWith("/api/storage/objects/")) ||
    (questCompletedPortraitAssetId === null) !== (questCompletedPortraitUrl === null) ||
    (questCompletedPortraitAssetId !== null &&
      !questCompletedPortraitAssetId.startsWith("/objects/uploads/card-images/")) ||
    (questCompletedPortraitUrl !== null &&
      !questCompletedPortraitUrl.startsWith("/api/storage/objects/")) ||
    (questCompleteAudioAssetId === null) !== (questCompleteAudioUrl === null) ||
    (questCompleteAudioAssetId !== null &&
      !questCompleteAudioAssetId.startsWith("/objects/uploads/audio/")) ||
    (questCompleteAudioUrl !== null &&
      !questCompleteAudioUrl.startsWith("/api/storage/objects/"))
  ) return null;
  if (hasQuest && (!text("questName", true) || !text("questText", true) ||
       !questCondition || typeof questCondition.event !== "string" || !questCondition.event.trim() ||
       questProgressRequired === null ||
       !text("questRewardText", true))) return null;
  return {
     name, description: text("description") ?? "", imageAssetId, imageUrl, imageUploadToken,
     imageDisplayMode, imageScale, imagePositionX, imagePositionY,
     questCompletedPortraitEnabled,
     questCompletedPortraitAssetId, questCompletedPortraitUrl,
     questCompletedPortraitUploadToken, maxHealth, abilityName, abilityCost,
    abilityText: text("abilityText") ?? "", abilityEffects, hasQuest,
    questName: hasQuest ? text("questName", true) : null,
    questText: hasQuest ? text("questText", true) : null,
      questCondition: hasQuest ? questCondition ?? null : null,
    questProgressRequired: hasQuest ? questProgressRequired : null,
    questRewardText: hasQuest ? text("questRewardText", true) : null,
    questRewardEffects: hasQuest ? object("questRewardEffects", true)! : null,
    upgradedAbilityName: text("upgradedAbilityName"),
    upgradedAbilityCost, upgradedAbilityText: text("upgradedAbilityText"),
    upgradedAbilityEffects: object("upgradedAbilityEffects", true) ?? null,
    championTokenDefinitionId: text("championTokenDefinitionId"),
     isStarterGrant,
    abilityAudioAssetId: text("abilityAudioAssetId"), abilityAudioUrl: text("abilityAudioUrl"),
    abilityAudioVolume, questCompleteAudioAssetId, questCompleteAudioUrl,
    questCompleteAudioVolume, questCompleteAudioEnabled, questCompleteAudioUploadToken,
  };
}

async function validateChampionTokenReference(
  championTokenDefinitionId: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!championTokenDefinitionId) return { ok: true };
  const [card] = await db
    .select({
      id: cardsTable.id,
      isChampionToken: cardsTable.isChampionToken,
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, championTokenDefinitionId))
    .limit(1);
  if (!card) return { ok: false, message: "연결할 Champion Token 카드를 찾을 수 없습니다." };
  if (!card.isChampionToken) return { ok: false, message: "isChampionToken 카드만 Champion Token으로 연결할 수 있습니다." };
  return { ok: true };
}

async function validatePublishedChampionToken(
  championTokenDefinitionId: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!championTokenDefinitionId) return { ok: true };
  const [card] = await db
    .select({
      id: cardsTable.id,
      isChampionToken: cardsTable.isChampionToken,
      status: cardsTable.status,
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, championTokenDefinitionId))
    .limit(1);
  if (!card || !card.isChampionToken) {
    return { ok: false, message: "공개할 Champion Token 참조가 유효하지 않습니다." };
  }
  if (card.status === "DISABLED") {
    return { ok: false, message: "비활성 Champion Token 카드가 연결되어 있어 공개할 수 없습니다." };
  }
  return { ok: true };
}

function containsStructuredAction(value: unknown, action: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsStructuredAction(item, action));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.action === action ||
    Object.values(record).some((item) => containsStructuredAction(item, action));
}

async function validatePublishedChampionEffects(
  champion: {
    championTokenDefinitionId: string | null;
    abilityEffects: unknown;
    questRewardEffects: unknown;
    upgradedAbilityEffects: unknown;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const requiresChampionToken = [
    champion.abilityEffects,
    champion.questRewardEffects,
    champion.upgradedAbilityEffects,
  ].some((config) => containsStructuredAction(config, "DEPLOY_CHAMPION_TOKEN"));
  if (requiresChampionToken && !champion.championTokenDefinitionId) {
    return { ok: false, message: "챔피언 토큰 전개 효과에는 연결된 Champion Token 카드가 필요합니다." };
  }
  return validatePublishedChampionToken(champion.championTokenDefinitionId);
}

const CARD_IMAGE_TYPES = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
} as const;
const AUDIO_TYPES = {
  "audio/mpeg": ["mp3"],
  "audio/ogg": ["ogg"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
} as const;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
const GAME_BACKGROUND_TYPES = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
} as const;
const GAME_BGM_TYPES = AUDIO_TYPES;
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

function signAudioAsset(assetId: string, expiresAt: number) {
  const secret = configuredSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const signature = createHmac("sha256", secret)
    .update(`card-audio:${assetId}:${expiresAt}`)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

function signGameMediaAsset(mediaType: (typeof GAME_MEDIA_TYPES)[number], assetId: string, expiresAt: number) {
  const secret = configuredSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const signature = createHmac("sha256", secret)
    .update(`game-media:${mediaType}:${assetId}:${expiresAt}`)
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

function validAudioAssetToken(assetId: string, token: string | null) {
  if (!token) return false;
  const separator = token.indexOf(".");
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (separator < 1 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }
  const expected = Buffer.from(signAudioAsset(assetId, expiresAt).slice(separator + 1));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validGameMediaAssetToken(
  mediaType: (typeof GAME_MEDIA_TYPES)[number],
  assetId: string,
  token: string | null,
) {
  if (!token) return false;
  const separator = token.indexOf(".");
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  if (separator < 1 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }
  const expected = Buffer.from(signGameMediaAsset(mediaType, assetId, expiresAt).slice(separator + 1));
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

async function validNewAudioAsset(assetId: string, token: string | null) {
  const extension = assetId.toLowerCase().split(".").pop() ?? "";
  if (!Object.values(AUDIO_TYPES).some((extensions) => extensions.some((item) => item === extension)) ||
      !validAudioAssetToken(assetId, token)) return false;
  return (await Promise.all(
    Object.entries(AUDIO_TYPES)
      .filter(([, extensions]) => extensions.some((item) => item === extension))
      .map(([contentType]) => audioStorage.verifyAudio(assetId, contentType, MAX_AUDIO_SIZE)),
  )).some(Boolean);
}

async function removeImageIfUnreferenced(assetId: string) {
  const [cardReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardsTable)
    .where(eq(cardsTable.imageAssetId, assetId));
  const [championReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(championsTable)
    .where(or(
      eq(championsTable.imageAssetId, assetId),
      eq(championsTable.questCompletedPortraitAssetId, assetId),
    ));
  const [shopReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shopListingsTable)
    .where(eq(shopListingsTable.imageAssetId, assetId));
  const [frameReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardFrameDefinitionsTable)
    .where(eq(cardFrameDefinitionsTable.frameAssetId, assetId));
  if (
    (cardReference?.count ?? 0) === 0 &&
    (championReference?.count ?? 0) === 0 &&
    (shopReference?.count ?? 0) === 0 &&
    (frameReference?.count ?? 0) === 0
  ) {
    await cardImageStorage.remove(assetId);
  }
}

async function removeAudioIfUnreferenced(assetId: string) {
  const [cardReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cardsTable)
    .where(eq(cardsTable.entranceAudioAssetId, assetId));
  const [questReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(championsTable)
    .where(eq(championsTable.questCompleteAudioAssetId, assetId));
  const [abilityReference] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(championsTable)
    .where(eq(championsTable.abilityAudioAssetId, assetId));
  if (
    (cardReference?.count ?? 0) === 0 &&
    (questReference?.count ?? 0) === 0 &&
    (abilityReference?.count ?? 0) === 0
  ) {
    await audioStorage.remove(assetId);
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

router.use(async (request, response, next) => {
  if (request.path === "/login" || request.path === "/session" || request.path === "/logout") {
    next();
    return;
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    if (user.role !== "ADMIN") {
      response.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
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
  if (request.authUser?.role === "ADMIN") {
    return true;
  }

  response.status(request.authUser ? 403 : 401).json({
    message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다.",
  });
  return false;
}

function parseCardInput(value: unknown): CardInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const cardType = input.cardType === "TECHNIQUE" ? "TECHNIQUE" : "WRESTLER";
  const requestedRarity = CARD_RARITIES.includes(input.rarity as (typeof CARD_RARITIES)[number])
    ? input.rarity as (typeof CARD_RARITIES)[number]
    : "NORMAL";
  const rarity = cardType === "TECHNIQUE" &&
    (requestedRarity === "LEGENDARY" || requestedRarity === "CHAMPION")
    ? input.isToken === true ? "TOKEN" : "NORMAL"
    : requestedRarity;
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
  const boundedNumber = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : fallback;
  const entranceAudioAssetId =
    typeof input.entranceAudioAssetId === "string" && input.entranceAudioAssetId
      ? input.entranceAudioAssetId : null;
  const entranceAudioUrl =
    typeof input.entranceAudioUrl === "string" && input.entranceAudioUrl
      ? input.entranceAudioUrl : null;
  const entranceAudioVolume = boundedNumber(input.entranceAudioVolume, 100, 0, 100);
  const entranceAudioEnabled = input.entranceAudioEnabled === true;
  const entranceAudioUploadToken =
    typeof input.entranceAudioUploadToken === "string" ? input.entranceAudioUploadToken : null;
  const imageDisplayMode = IMAGE_DISPLAY_MODES.includes(input.imageDisplayMode as (typeof IMAGE_DISPLAY_MODES)[number])
    ? input.imageDisplayMode as (typeof IMAGE_DISPLAY_MODES)[number]
    : "COVER";
  const imageScale = boundedNumber(input.imageScale, 1, 0.5, 2);
  const imagePositionX = boundedNumber(input.imagePositionX, 50, 0, 100);
  const imagePositionY = boundedNumber(input.imagePositionY, 50, 0, 100);
  const isStarterGrant = input.isStarterGrant === true;
  const rawTags = input.tags;
  const tags = parseCardTags(rawTags);
  const validInteger = (candidate: unknown) =>
    typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 0 &&
    candidate <= 999;

  if (
    !name ||
    name.length > 120 ||
    !CARD_TYPES.includes(input.cardType as (typeof CARD_TYPES)[number]) ||
    (input.rarity !== undefined && !CARD_RARITIES.includes(input.rarity as (typeof CARD_RARITIES)[number])) ||
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
    tags === null ||
    tags.length > 3 ||
    tags.some((tag) => tag.length === 0) ||
    !input.effectConfig ||
    typeof input.effectConfig !== "object" ||
    Array.isArray(input.effectConfig)
     || (effectId === "STRUCTURED_EFFECTS_V1" && !isStructuredEffects(input.effectConfig))
     || (effectId === "SCRIPT_V1" && !isEffectScriptConfig(input.effectConfig))
    || (imageAssetId === null) !== (imageUrl === null)
    || (imageAssetId !== null &&
      !imageAssetId.startsWith("/objects/uploads/card-images/"))
    || (imageUrl !== null && !imageUrl.startsWith("/api/storage/objects/"))
    || (entranceAudioAssetId === null) !== (entranceAudioUrl === null)
    || (entranceAudioAssetId !== null &&
      !entranceAudioAssetId.startsWith("/objects/uploads/audio/"))
    || (entranceAudioUrl !== null &&
      !entranceAudioUrl.startsWith("/api/storage/objects/"))
  ) {
    return null;
  }

  return {
    name,
    cardType: cardType as CardInput["cardType"],
    rarity,
    cost: input.cost as number,
    attack: input.attack as number,
    health: input.health as number,
    text,
    keywords: [...new Set(input.keywords)] as CardInput["keywords"],
    tags,
    isToken: input.isToken,
    isChampionToken: input.isChampionToken,
    isStarterGrant,
    effectId,
    effectConfig: input.effectConfig as Record<string, unknown>,
    imageAssetId,
    imageUrl: imageAssetId ? imageUrlFor(imageAssetId) : null,
    imageDisplayMode,
    imageScale,
    imagePositionX,
    imagePositionY,
    imageUploadToken,
    entranceAudioAssetId,
    entranceAudioUrl: entranceAudioAssetId ? `/api/storage${entranceAudioAssetId}` : null,
    entranceAudioVolume,
    entranceAudioEnabled,
    entranceAudioUploadToken,
  };
}

function firstParam(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const CHAMPION_EFFECT_CONTEXTS = [
  "CHAMPION_ABILITY",
  "QUEST_CONDITION",
  "QUEST_REWARD",
  "UPGRADED_CHAMPION_ABILITY",
] as const;
type ChampionEffectContext = (typeof CHAMPION_EFFECT_CONTEXTS)[number];

function championEffectContext(body: Record<string, unknown>): ChampionEffectContext | undefined {
  if (typeof body.effectContext === "string" &&
      CHAMPION_EFFECT_CONTEXTS.includes(body.effectContext as ChampionEffectContext)) {
    return body.effectContext as ChampionEffectContext;
  }
  if (body.sourceType !== "CHAMPION") return undefined;
  const legacySlot = body.effectSlot;
  if (legacySlot === "ABILITY") return "CHAMPION_ABILITY";
  if (legacySlot === "QUEST_REWARD") return "QUEST_REWARD";
  if (legacySlot === "UPGRADED_ABILITY") return "UPGRADED_CHAMPION_ABILITY";
  return undefined;
}

async function cardReferenceCatalog(): Promise<CardReferenceCandidate[]> {
  const cards = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    cardType: cardsTable.cardType,
    isToken: cardsTable.isToken,
    isChampionToken: cardsTable.isChampionToken,
  }).from(cardsTable);
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    cardType: card.cardType === "TECHNIQUE" ? "TECHNIQUE" : "WRESTLER",
    isToken: card.isToken,
    isChampionToken: card.isChampionToken,
  }));
}

async function publishedEffectPayloadError(card: {
  text: string;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
}): Promise<string | null> {
  if (card.effectId === "STRUCTURED_EFFECTS_V1" && isStructuredEffects(card.effectConfig)) {
    return null;
  }
  if (card.effectId) return null;

  const analysis = analyzeEffectText(card.text, {
    cardCatalog: await cardReferenceCatalog(),
  });
  return analysis.status === "success" && analysis.effects.length > 0
    ? "실행 가능한 구조화 효과를 저장한 뒤 공개해 주세요."
    : null;
}

function collectCardDefinitionReferenceIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCardDefinitionReferenceIds(item, ids);
    return ids;
  }
  if (!value || typeof value !== "object") return ids;
  const record = value as Record<string, unknown>;
  const definitionRef = record.definitionRef;
  if (definitionRef && typeof definitionRef === "object" && !Array.isArray(definitionRef)) {
    const id = (definitionRef as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) ids.add(id);
  }
  for (const child of Object.values(record)) collectCardDefinitionReferenceIds(child, ids);
  return ids;
}

async function validatePublishedCardReferences(rootId: string): Promise<string[]> {
  const cards = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    status: cardsTable.status,
    effectConfig: cardsTable.effectConfig,
  }).from(cardsTable);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const visited = new Set<string>();
  const errors: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const card = byId.get(id);
    if (!card) {
      errors.push(`없는 참조 카드 ID: ${id}`);
      return;
    }
    if (card.status !== "PUBLISHED" && id !== rootId) {
      errors.push(`공개되지 않은 참조 카드: ${card.name} (${id})`);
      return;
    }
    for (const referencedId of collectCardDefinitionReferenceIds(card.effectConfig)) visit(referencedId);
  };
  visit(rootId);
  return [...new Set(errors)];
}

async function publishedCardDependents(targetId: string): Promise<string[]> {
  const cards = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    status: cardsTable.status,
    effectConfig: cardsTable.effectConfig,
  }).from(cardsTable);
  return cards
    .filter((card) => card.status === "PUBLISHED" && card.id !== targetId)
    .filter((card) => collectCardDefinitionReferenceIds(card.effectConfig).has(targetId))
    .map((card) => `${card.name} (${card.id})`);
}

export function analyzeForContext(
  text: string,
  context?: ChampionEffectContext,
  catalog?: readonly CardReferenceCandidate[],
): Analysis {
  if (context === "QUEST_CONDITION") {
    const quest = analyzeChampionQuestText(text);
    const condition = "condition" in quest ? quest.condition : undefined;
    const unsupportedParts = "unsupportedParts" in quest ? quest.unsupportedParts : [];
    return {
      status: quest.outcome === "supported" ? "success" : "failure",
      outcome: quest.outcome,
      effects: [],
      keywords: [],
      unsupportedSegments: unsupportedParts,
      summaries: condition ? [JSON.stringify(condition)] : [],
      ...(condition ? { condition } : {}),
      ...(quest.outcome !== "supported"
        ? { reason: "퀘스트 조건을 현재 공유 Analyzer에서 완전히 해석하지 못했습니다." }
        : {}),
    };
  }
  const championUpgradePattern =
    /고유\s*능력(?:을|이)?\s*(?:강화(?:시키고|시킨다|시킵니다|하고|한다|합니다)?|업그레이드(?:하고|한다|합니다)?)\s*,?/i;
  const championUpgrade = context === "QUEST_REWARD" &&
    championUpgradePattern.test(text);
  const effectText = championUpgrade
    ? text.replace(championUpgradePattern, "").replace(/^[,.\s]+|[,.\s]+$/g, "").trim()
    : text;
  const analysis = effectText
    ? analyzeEffectText(effectText, {
        ...(context ? { defaultTrigger: "ENTER_FIELD" as Trigger } : {}),
        ...(catalog ? { cardCatalog: catalog } : {}),
      })
    : {
        status: "success" as const,
        outcome: "supported" as const,
        effects: [],
        keywords: [],
        unsupportedSegments: [],
        summaries: [],
      };
  if (!championUpgrade) return analysis;
  const unsupportedSegments = analysis.unsupportedSegments.filter(
    (segment) => !/능력|강화/i.test(segment),
  );
  return {
    ...analysis,
    status: unsupportedSegments.length ? "partial" : "success",
    outcome: unsupportedSegments.length ? analysis.outcome : "supported",
    effects: [
      { trigger: "ENTER_FIELD", action: "UPGRADE_CHAMPION_ABILITY" } as unknown as Analysis["effects"][number],
      ...analysis.effects,
    ],
    unsupportedSegments,
    ...(unsupportedSegments.length ? {} : { reason: undefined }),
  };
}

function fullPromptText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

function fullPromptObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasStructuredPayload(value: unknown): boolean {
  const object = fullPromptObject(value);
  return Boolean(object && Object.keys(object).length);
}

function fullSectionStatus(analysis: Analysis): ChampionFullSectionStatus {
  return analysis.outcome === "supported"
    ? "SUPPORTED"
    : analysis.outcome === "mechanism_required"
      ? "NEW_MECHANIC_REQUIRED"
      : "ANALYSIS_FAILED";
}

type FullPromptInput = {
  name: string;
  description: string;
  maxHealth: unknown;
  abilityName: string;
  abilityCost: unknown;
  abilityText: string;
  abilityEffects?: Record<string, unknown>;
  hasQuest: boolean;
  questName: string;
  questText: string;
  questCondition?: Record<string, unknown>;
  questProgressRequired: unknown;
  questRewardText: string;
  questRewardEffects?: Record<string, unknown>;
  upgradedAbilityName: string;
  upgradedAbilityCost: unknown;
  upgradedAbilityText: string;
  upgradedAbilityEffects?: Record<string, unknown>;
  championTokenDefinitionId: string;
};

function fullPromptInput(value: unknown): FullPromptInput | null {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!input) return null;
  const stringValue = (key: string) => fullPromptText(input[key]);
  const tokenId = stringValue("championTokenDefinitionId");
  return {
    name: stringValue("name"),
    description: stringValue("description"),
    maxHealth: input.maxHealth,
    abilityName: stringValue("abilityName"),
    abilityCost: input.abilityCost,
    abilityText: stringValue("abilityText"),
    abilityEffects: fullPromptObject(input.abilityEffects),
    hasQuest: input.hasQuest === true,
    questName: stringValue("questName"),
    questText: stringValue("questText"),
    questCondition: fullPromptObject(input.questCondition),
    questProgressRequired: input.questProgressRequired,
    questRewardText: stringValue("questRewardText"),
    questRewardEffects: fullPromptObject(input.questRewardEffects),
    upgradedAbilityName: stringValue("upgradedAbilityName"),
    upgradedAbilityCost: input.upgradedAbilityCost,
    upgradedAbilityText: stringValue("upgradedAbilityText"),
    upgradedAbilityEffects: fullPromptObject(input.upgradedAbilityEffects),
    championTokenDefinitionId: tokenId,
  };
}

async function buildChampionFullPromptData(input: FullPromptInput): Promise<ChampionFullPromptData> {
  const catalog = await cardReferenceCatalog();
  const sections: ChampionFullSection[] = [];
  const unsupportedParts: string[] = [];
  const addSection = (
    key: string,
    label: string,
    sourceText: string,
    structuredEffect: unknown,
    context?: ChampionEffectContext,
  ) => {
    if (!sourceText && !hasStructuredPayload(structuredEffect)) return;
    const analysis = sourceText
      ? analyzeForContext(sourceText, context, catalog)
      : undefined;
    const status = analysis ? fullSectionStatus(analysis) : "SUPPORTED";
    const section: ChampionFullSection = {
      key,
      label,
      status,
      ...(sourceText ? { sourceText } : {}),
      ...(hasStructuredPayload(structuredEffect) ? { structuredEffect } : {}),
      ...(analysis ? { analysis } : {}),
    };
    sections.push(section);
    if (analysis && analysis.outcome !== "supported") {
      const parts = analysis.unsupportedSegments.length
        ? analysis.unsupportedSegments
        : [analysis.reason ?? `${label} 분석 실패`];
      unsupportedParts.push(...parts);
    }
  };

  addSection("CHAMPION_ABILITY", "기본 Champion Ability", input.abilityText, input.abilityEffects, "CHAMPION_ABILITY");
  if (input.hasQuest) {
    addSection("QUEST_CONDITION", "Quest Condition", input.questText, input.questCondition, "QUEST_CONDITION");
    addSection("QUEST_REWARD", "Quest Reward", input.questRewardText, input.questRewardEffects, "QUEST_REWARD");
  }
  addSection(
    "UPGRADED_CHAMPION_ABILITY",
    "강화 Champion Ability",
    input.upgradedAbilityText,
    input.upgradedAbilityEffects,
    "UPGRADED_CHAMPION_ABILITY",
  );

  let token: ChampionFullToken | undefined;
  let tokenReferenceError: string | undefined;
  if (input.championTokenDefinitionId) {
    const [card] = await db.select({
      id: cardsTable.id,
      name: cardsTable.name,
      cardType: cardsTable.cardType,
      cost: cardsTable.cost,
      attack: cardsTable.attack,
      health: cardsTable.health,
      text: cardsTable.text,
      keywords: cardsTable.keywords,
      effectId: cardsTable.effectId,
      effectConfig: cardsTable.effectConfig,
      isToken: cardsTable.isToken,
      isChampionToken: cardsTable.isChampionToken,
      status: cardsTable.status,
    }).from(cardsTable).where(eq(cardsTable.id, input.championTokenDefinitionId)).limit(1);
    if (!card) {
      tokenReferenceError = `CardDefinition을 찾을 수 없습니다: ${input.championTokenDefinitionId}`;
    } else {
      token = card;
      if (!card.isChampionToken) tokenReferenceError = "연결된 CardDefinition이 Champion Token이 아닙니다.";
      addSection("CHAMPION_TOKEN_EFFECT", "연결된 Champion Token 효과", card.text, card.effectConfig, undefined);
    }
  }
  if (tokenReferenceError) unsupportedParts.push(`Champion Token: ${tokenReferenceError}`);

  const library = effectLibrary();
  const analysis = {
    sections,
    unsupportedParts: dedupeUnsupportedMechanics(unsupportedParts),
    fullySupported: unsupportedParts.length === 0 && !tokenReferenceError,
    ...(token ? { token } : {}),
    ...(tokenReferenceError ? { tokenReferenceError } : {}),
  };
  return {
    champion: {
      name: input.name,
      description: input.description,
      maxHealth: input.maxHealth,
      abilityName: input.abilityName,
      abilityCost: input.abilityCost,
      abilityText: input.abilityText,
      abilityEffects: input.abilityEffects ?? {},
      hasQuest: input.hasQuest,
      ...(input.hasQuest ? {
        questName: input.questName,
        questText: input.questText,
        questCondition: input.questCondition ?? null,
        questProgressRequired: input.questProgressRequired,
        questRewardText: input.questRewardText,
        questRewardEffects: input.questRewardEffects ?? null,
      } : {}),
      ...(input.upgradedAbilityName || input.upgradedAbilityText || input.upgradedAbilityEffects ? {
        upgradedAbilityName: input.upgradedAbilityName,
        upgradedAbilityCost: input.upgradedAbilityCost,
        upgradedAbilityText: input.upgradedAbilityText,
        upgradedAbilityEffects: input.upgradedAbilityEffects ?? null,
      } : {}),
      ...(input.championTokenDefinitionId ? {
        championTokenDefinitionId: input.championTokenDefinitionId,
      } : {}),
    },
    sections,
    unsupportedParts: analysis.unsupportedParts,
    ...(token ? { token } : {}),
    ...(tokenReferenceError ? { tokenReferenceError } : {}),
    library: {
      actions: library.actions.map((entry) => ({ ...entry })),
      triggers: library.triggers.map((entry) => ({ ...entry })),
      conditions: (library.conditions ?? []).map((entry) => ({ ...entry })),
      targetResolvers: library.targetResolvers.map((entry) => ({ ...entry })),
      valueResolvers: library.valueResolvers.map((entry) => ({ ...entry })),
    },
  };
}

router.post("/effects/analyze", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const text = body.text;
  if (typeof text !== "string" || text.length > 2000) {
    response.status(400).json({ message: "효과 텍스트를 확인해 주세요." }); return;
  }
  const context = championEffectContext(body);
  const analysis = analyzeForContext(text, context, await cardReferenceCatalog());
  response.json(context ? { ...analysis, unsupportedParts: analysis.unsupportedSegments } : analysis);
});

router.post("/effects/generate", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown>
    : {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const sourceType = body.sourceType === "CHAMPION" ? "CHAMPION" : body.sourceType === "CARD" ? "CARD" : null;
  const effectContext = typeof body.effectContext === "string" &&
    ["CHAMPION_ABILITY", "QUEST_REWARD", "UPGRADED_CHAMPION_ABILITY"].includes(body.effectContext)
    ? body.effectContext as EffectAiContext["effectContext"]
    : undefined;
  const cardType = body.cardType === "TECHNIQUE" ? "TECHNIQUE" : body.cardType === "WRESTLER" ? "WRESTLER" : undefined;
  const sourceName = typeof body.sourceName === "string" ? body.sourceName.trim().slice(0, 120) : undefined;
  if (!text || text.length > 2000 || !sourceType ||
      (sourceType === "CHAMPION" && !effectContext) ||
      (sourceType === "CARD" && effectContext)) {
    response.status(400).json({ message: "AI 효과 생성 입력값을 확인해 주세요." });
    return;
  }
  try {
    const result = await generateEffectDraft(
      text,
      { sourceType, ...(cardType ? { cardType } : {}), ...(effectContext ? { effectContext } : {}), ...(sourceName ? { sourceName } : {}) },
      await cardReferenceCatalog(),
    );
    if (result.status === "NEEDS_CLARIFICATION") {
      response.status(409).json(result);
      return;
    }
    response.json({
      ...result,
      structuredEffect: result.effectConfig,
    });
  } catch (error) {
    if (error instanceof EffectAiError) {
      const status = error.code === "NOT_CONFIGURED" ? 503
        : error.code === "INVALID_DRAFT" || error.code === "MALFORMED_RESPONSE" ? 422
          : 502;
      response.status(status).json({ message: error.message, code: error.code });
      return;
    }
    response.status(502).json({ message: "AI 효과 생성 요청을 처리하지 못했습니다." });
  }
});

router.post("/quests/analyze", (request, response) => {
  if (!requireAdmin(request, response)) return;
  const text = request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>).text : null;
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    response.status(400).json({ message: "퀘스트 조건을 확인해 주세요." }); return;
  }
  const analysis = analyzeChampionQuestText(text);
  if (analysis.outcome === "supported") {
    response.json(analysis); return;
  }
  response.status(422).json(analysis);
});

router.post("/effects/replit-prompt", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const context = championEffectContext(body);
  const name = typeof body.championName === "string" && body.championName.trim()
    ? body.championName.trim().slice(0, 120) : "이름 미입력";
  if (!text || text.length > 2000 || !context) {
    response.status(400).json({ message: "효과와 Champion 효과 영역을 확인해 주세요." });
    return;
  }
   const analysis = analyzeForContext(text, context, await cardReferenceCatalog());
  const promptDecision = prepareReplitAgentPrompt(
    text,
    analysis,
    effectLibrary(),
    name,
    context,
  );
  if (promptDecision.kind === "supported") {
    response.status(409).json({ message: "현재 Effect Library로 구현할 수 있습니다.", analysis });
    return;
  }
  response.json({ analysis, prompt: promptDecision.prompt });
});

async function fullChampionPromptRequest(
  request: Request,
  response: Response,
  includePrompt: boolean,
): Promise<void> {
  if (!requireAdmin(request, response)) return;
  const input = fullPromptInput(request.body);
  if (!input) {
    response.status(400).json({ message: "Champion 전체 분석에 필요한 현재 폼 데이터를 확인해 주세요." });
    return;
  }
  const data = await buildChampionFullPromptData(input);
  const analysis = {
    sections: data.sections,
    unsupportedParts: data.unsupportedParts,
    fullySupported: data.unsupportedParts.length === 0 && !data.tokenReferenceError,
    ...(data.token ? { token: data.token } : {}),
    ...(data.tokenReferenceError ? { tokenReferenceError: data.tokenReferenceError } : {}),
  };
  response.json({
    analysis,
    ...(includePrompt ? { prompt: createChampionFullPrompt(data) } : {}),
  });
}

router.post("/champions/full-analyze", async (request, response): Promise<void> => {
  await fullChampionPromptRequest(request, response, false);
});

router.post("/champions/full-prompt", async (request, response): Promise<void> => {
  await fullChampionPromptRequest(request, response, true);
});

router.post("/effects/unified-full-prompt", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;

  const [cards, champions, catalog] = await Promise.all([
    db.select().from(cardsTable).orderBy(asc(cardsTable.name)),
    db.select().from(championsTable).orderBy(asc(championsTable.name)),
    cardReferenceCatalog(),
  ]);
  const entries: UnifiedEntry[] = [];
  const tokenReferences: UnifiedEffectPromptData["tokenReferences"] = [];

  for (const card of cards) {
    if (card.cardType !== "WRESTLER") continue;
    const sourceText = card.text.trim();
    const analysis = analyzeForContext(sourceText, undefined, catalog);
    entries.push({
      kind: "WRESTLER_CARD",
      id: card.id,
      name: card.name,
      version: card.version,
      recordStatus: card.status,
      slot: "CARD_EFFECT",
      label: "선수 카드 효과",
      sourceText,
      status: fullSectionStatus(analysis),
      analysis,
      ...(hasStructuredPayload(card.effectConfig) ? { storedStructuredEffect: card.effectConfig } : {}),
      ...(!sourceText ? { note: "원문 효과가 없어 실행할 효과가 없습니다." } : {}),
    });
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const addChampionEntry = (
    champion: typeof champions[number],
    slot: string,
    label: string,
    sourceText: string | null,
    context: ChampionEffectContext,
    storedStructuredEffect: unknown,
  ) => {
    const text = (sourceText ?? "").trim();
    const analysis = analyzeForContext(text, context, catalog);
    entries.push({
      kind: "CHAMPION",
      id: champion.id,
      name: champion.name,
      version: champion.version,
      recordStatus: champion.status,
      slot,
      label,
      sourceText: text,
      status: fullSectionStatus(analysis),
      analysis,
      ...(hasStructuredPayload(storedStructuredEffect) ? { storedStructuredEffect } : {}),
      ...(!text ? { note: "이 슬롯에 저장된 원문이 없습니다." } : {}),
    });
  };

  for (const champion of champions) {
    addChampionEntry(
      champion,
      "CHAMPION_ABILITY",
      "기본 Champion Ability",
      champion.abilityText,
      "CHAMPION_ABILITY",
      champion.abilityEffects,
    );
    if (champion.hasQuest) {
      addChampionEntry(
        champion,
        "QUEST_CONDITION",
        "Quest Condition",
        champion.questText,
        "QUEST_CONDITION",
        champion.questCondition,
      );
      addChampionEntry(
        champion,
        "QUEST_REWARD",
        "Quest Reward",
        champion.questRewardText,
        "QUEST_REWARD",
        champion.questRewardEffects,
      );
    }
    if (champion.upgradedAbilityText?.trim() || champion.upgradedAbilityEffects) {
      addChampionEntry(
        champion,
        "UPGRADED_CHAMPION_ABILITY",
        "강화 Champion Ability",
        champion.upgradedAbilityText,
        "UPGRADED_CHAMPION_ABILITY",
        champion.upgradedAbilityEffects,
      );
    }

    if (!champion.championTokenDefinitionId) continue;
    const token = cardById.get(champion.championTokenDefinitionId);
    if (token) {
      tokenReferences.push({
        championId: champion.id,
        championName: champion.name,
        definitionId: token.id,
        name: token.name,
        text: token.text,
        status: token.status,
      });
    } else {
      entries.push({
        kind: "CHAMPION",
        id: champion.id,
        name: champion.name,
        version: champion.version,
        recordStatus: champion.status,
        slot: "CHAMPION_TOKEN_REFERENCE",
        label: "Champion Token 참조",
        sourceText: champion.championTokenDefinitionId,
        status: "ANALYSIS_FAILED",
        note: `연결된 CardDefinition을 찾을 수 없습니다: ${champion.championTokenDefinitionId}`,
        analysis: {
          status: "failure",
          outcome: "analysis_failure",
          effects: [],
          keywords: [],
          unsupportedSegments: [`Champion Token 참조 누락: ${champion.championTokenDefinitionId}`],
          summaries: [],
        },
      });
    }
  }

  const library = effectLibrary();
  const data: UnifiedEffectPromptData = {
    entries,
    mechanics: collectUnifiedMechanics(entries),
    tokenReferences,
    library: {
      actions: library.actions.map((entry) => ({ ...entry })),
      triggers: library.triggers.map((entry) => ({ ...entry })),
      conditions: (library.conditions ?? []).map((entry) => ({ ...entry })),
      targetResolvers: library.targetResolvers.map((entry) => ({ ...entry })),
      valueResolvers: library.valueResolvers.map((entry) => ({ ...entry })),
    },
  };
  response.json({
    analysis: {
      entries: data.entries,
      mechanics: data.mechanics,
      tokenReferences: data.tokenReferences,
      summary: {
        total: data.entries.length,
        supported: data.entries.filter((entry) => entry.status === "SUPPORTED").length,
        newMechanicRequired: data.entries.filter((entry) => entry.status === "NEW_MECHANIC_REQUIRED").length,
        analysisFailed: data.entries.filter((entry) => entry.status === "ANALYSIS_FAILED").length,
        fullySupported: data.mechanics.length === 0,
      },
    },
    prompt: createUnifiedEffectPrompt(data),
  });
});

router.get("/champions", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const search = firstParam(request.query.search)?.trim();
  const status = firstParam(request.query.status);
  const filters = [];
  if (search) filters.push(ilike(championsTable.name, `%${search}%`));
  if (CHAMPION_STATUSES.includes(status as (typeof CHAMPION_STATUSES)[number])) {
    filters.push(eq(championsTable.status, status as string));
  }
  const champions = await db.select().from(championsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(championsTable.name));
  response.json({ champions });
});

router.get("/champions/:id/test", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) {
    response.status(400).json({ message: "챔피언 ID가 올바르지 않습니다." });
    return;
  }
  const [champion] = await db.select().from(championsTable).where(eq(championsTable.id, id)).limit(1);
  if (!champion || champion.status === "DISABLED") {
    response.status(404).json({ message: "테스트할 수 있는 챔피언을 찾을 수 없습니다." });
    return;
  }
  response.json({ champion });
});

router.post("/champions", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = parseChampionInput(request.body);
  if (!input) { response.status(400).json({ message: "챔피언 입력값을 확인해 주세요." }); return; }
  const tokenValidation = await validateChampionTokenReference(input.championTokenDefinitionId);
  if (!tokenValidation.ok) { response.status(400).json({ message: tokenValidation.message }); return; }
  if (
    input.imageAssetId &&
    !(await validNewImageAsset(input.imageAssetId, input.imageUploadToken))
  ) {
    response.status(400).json({ message: "검증된 기본 초상화 업로드 정보가 필요합니다." });
    return;
  }
  if (
    input.questCompleteAudioAssetId &&
    !(await validNewAudioAsset(input.questCompleteAudioAssetId, input.questCompleteAudioUploadToken))
  ) {
    response.status(400).json({ message: "검증된 퀘스트 완료 음악 업로드 정보가 필요합니다." });
    return;
  }
  if (
    input.questCompletedPortraitAssetId &&
    !(await validNewImageAsset(
      input.questCompletedPortraitAssetId,
      input.questCompletedPortraitUploadToken,
    ))
  ) {
    response.status(400).json({ message: "검증된 퀘스트 완료 초상화 업로드 정보가 필요합니다." });
    return;
  }
  const {
    imageUploadToken: _imageUploadToken,
    questCompleteAudioUploadToken: _questCompleteAudioUploadToken,
    questCompletedPortraitUploadToken: _questCompletedPortraitUploadToken,
    ...championValues
  } = input;
  const [champion] = await db.insert(championsTable).values({
    id: randomUUID(), ...championValues, status: "DRAFT", version: 1,
  }).returning();
  response.status(201).json({ champion });
});

router.patch("/champions/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  const input = parseChampionInput(request.body);
  if (!id || !input) { response.status(400).json({ message: "챔피언 입력값을 확인해 주세요." }); return; }
  const tokenValidation = await validateChampionTokenReference(input.championTokenDefinitionId);
  if (!tokenValidation.ok) { response.status(400).json({ message: tokenValidation.message }); return; }
  const [existing] = await db.select().from(championsTable).where(eq(championsTable.id, id)).limit(1);
  if (!existing) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
  if (
    input.imageAssetId &&
    input.imageAssetId !== existing.imageAssetId &&
    !(await validNewImageAsset(input.imageAssetId, input.imageUploadToken))
  ) {
    response.status(400).json({ message: "검증된 기본 초상화 업로드 정보가 필요합니다." });
    return;
  }
  if (
    input.questCompleteAudioAssetId &&
    input.questCompleteAudioAssetId !== existing.questCompleteAudioAssetId &&
    !(await validNewAudioAsset(input.questCompleteAudioAssetId, input.questCompleteAudioUploadToken))
  ) {
    response.status(400).json({ message: "검증된 퀘스트 완료 음악 업로드 정보가 필요합니다." });
    return;
  }
  if (
    input.questCompletedPortraitAssetId &&
    input.questCompletedPortraitAssetId !== existing.questCompletedPortraitAssetId &&
    !(await validNewImageAsset(
      input.questCompletedPortraitAssetId,
      input.questCompletedPortraitUploadToken,
    ))
  ) {
    response.status(400).json({ message: "검증된 퀘스트 완료 초상화 업로드 정보가 필요합니다." });
    return;
  }
  const {
    imageUploadToken: _imageUploadToken,
    questCompleteAudioUploadToken: _questCompleteAudioUploadToken,
    questCompletedPortraitUploadToken: _questCompletedPortraitUploadToken,
    ...championValues
  } = input;
  const [champion] = await db.update(championsTable).set({
    ...championValues, version: sql`${championsTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(championsTable.id, id)).returning();
  if (
    existing.questCompleteAudioAssetId &&
    existing.questCompleteAudioAssetId !== input.questCompleteAudioAssetId
  ) {
    await removeAudioIfUnreferenced(existing.questCompleteAudioAssetId);
  }
  if (
    existing.questCompletedPortraitAssetId &&
    existing.questCompletedPortraitAssetId !== input.questCompletedPortraitAssetId
  ) {
    await removeImageIfUnreferenced(existing.questCompletedPortraitAssetId);
  }
  response.json({ champion });
});

router.delete("/champions/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) { response.status(400).json({ message: "챔피언 ID가 올바르지 않습니다." }); return; }
  const [existing] = await db.select().from(championsTable).where(eq(championsTable.id, id)).limit(1);
  if (!existing) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
  const [deleted] = await db.delete(championsTable).where(eq(championsTable.id, id)).returning();
  if (!deleted) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
  const assets = [
    existing.imageAssetId,
    existing.questCompletedPortraitAssetId,
    existing.questCompleteAudioAssetId,
    existing.abilityAudioAssetId,
  ]
    .filter((assetId): assetId is string => Boolean(assetId));
  await Promise.all([
    ...assets.filter((assetId) => assetId.startsWith("/objects/uploads/card-images/")).map(removeImageIfUnreferenced),
    ...assets.filter((assetId) => assetId.startsWith("/objects/uploads/audio/")).map(removeAudioIfUnreferenced),
  ]);
  response.status(204).end();
});

router.post("/champions/:id/duplicate", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) { response.status(400).json({ message: "챔피언 ID가 올바르지 않습니다." }); return; }
  const [source] = await db.select().from(championsTable).where(eq(championsTable.id, id)).limit(1);
  if (!source) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = source;
  const [champion] = await db.insert(championsTable).values({
    ...copy, id: randomUUID(), name: `${source.name} Copy`, status: "DRAFT", version: 1,
  }).returning();
  response.status(201).json({ champion });
});

router.post("/champions/:id/status", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  const status = request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>).status : null;
  if (!id || !CHAMPION_STATUSES.includes(status as (typeof CHAMPION_STATUSES)[number])) {
    response.status(400).json({ message: "챔피언 상태를 확인해 주세요." }); return;
  }
  if (status === "PUBLISHED") {
    const [existing] = await db
      .select({ championTokenDefinitionId: championsTable.championTokenDefinitionId })
      .from(championsTable)
      .where(eq(championsTable.id, id))
      .limit(1);
    if (!existing) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
    const [champion] = await db
      .select({
        championTokenDefinitionId: championsTable.championTokenDefinitionId,
        abilityEffects: championsTable.abilityEffects,
        questRewardEffects: championsTable.questRewardEffects,
        upgradedAbilityEffects: championsTable.upgradedAbilityEffects,
      })
      .from(championsTable)
      .where(eq(championsTable.id, id))
      .limit(1);
    const tokenValidation = champion
      ? await validatePublishedChampionEffects(champion)
      : { ok: false as const, message: "챔피언을 찾을 수 없습니다." };
    if (!tokenValidation.ok) { response.status(422).json({ message: tokenValidation.message }); return; }
  }
  const [champion] = await db.update(championsTable).set({
    status: status as string, version: sql`${championsTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(championsTable.id, id)).returning();
  if (!champion) { response.status(404).json({ message: "챔피언을 찾을 수 없습니다." }); return; }
  response.json({ champion });
});

router.get("/effects/library", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const cards = await db.select({ effectId: cardsTable.effectId, effectConfig: cardsTable.effectConfig }).from(cardsTable);
  const usage = countStructuredEffectUsage(cards);
  const library = effectLibrary();
  response.json({ ...library, actions: library.actions.map((action) => ({ ...action, usageCount: usage.get(action.name) ?? 0 })) });
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

router.post("/mechanic-requests/:id/reanalyze", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) { response.status(400).json({ message: "요청 ID가 올바르지 않습니다." }); return; }
  const [mechanicRequest] = await db.select().from(mechanicRequestsTable).where(eq(mechanicRequestsTable.id, id)).limit(1);
  if (!mechanicRequest) { response.status(404).json({ message: "메커니즘 요청을 찾을 수 없습니다." }); return; }
  // The persisted source is intentionally the only input: this always rereads live registry data.
  response.json({ mechanicRequestId: id, validation: validateMechanicCompletion(mechanicRequest.originalCardText) });
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
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const cardName = typeof body.cardName === "string" && body.cardName.trim()
    ? body.cardName.trim().slice(0, 120) : undefined;
   const analysis = analyzeEffectText(mechanicRequest.originalCardText, { cardCatalog: await cardReferenceCatalog() });
  const promptDecision = prepareReplitAgentPrompt(mechanicRequest.originalCardText, analysis, effectLibrary(), cardName);
  if (promptDecision.kind === "supported") {
    response.status(409).json({ message: "이제 현재 Effect Library로 구현할 수 있습니다.", analysis });
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
  const cardName = typeof body.cardName === "string" && body.cardName.trim()
    ? body.cardName.trim().slice(0, 120) : undefined;
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
   const analysis = analyzeEffectText(mechanicRequest.originalCardText, { cardCatalog: await cardReferenceCatalog() });
  const promptDecision = prepareReplitAgentPrompt(mechanicRequest.originalCardText, analysis, effectLibrary(), cardName);
  if (promptDecision.kind === "supported") {
    response.status(409).json({ message: "이제 현재 Effect Library로 구현할 수 있습니다.", analysis });
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

router.get("/session", async (request, response) => {
  const user = await getAuthenticatedUser(request);
  if (!user || user.role !== "ADMIN") {
    response.json({ authenticated: false, user: null });
    return;
  }
  response.json({ authenticated: true, user });
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

router.post("/audio/upload-url", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const name = typeof body.name === "string" ? body.name : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : 0;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const validExtensions = AUDIO_TYPES[contentType as keyof typeof AUDIO_TYPES];
  if (!validExtensions || !validExtensions.some((item) => item === extension) ||
      !Number.isInteger(size) || size <= 0 || size > MAX_AUDIO_SIZE) {
    response.status(400).json({
      message: "MP3, OGG, WAV 오디오 파일만 업로드할 수 있으며 최대 크기는 20MB입니다.",
    });
    return;
  }
  const upload = await audioStorage.createUpload(extension);
  response.json({ ...upload, maxSize: MAX_AUDIO_SIZE, contentType });
});

function parseAudioMultipart(request: Request) {
  const contentType = request.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch || !Buffer.isBuffer(request.body)) return null;
  const boundary = Buffer.from(`--${boundaryMatch[1]}`);
  const body = request.body as Buffer;
  const start = body.indexOf(boundary);
  if (start < 0) return null;
  const headerStart = start + boundary.length + 2;
  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
  if (headerEnd < 0) return null;
  const headers = body.subarray(headerStart, headerEnd).toString("utf8");
  const disposition = headers.match(/content-disposition:[^\r\n]*name="file"[^\r\n]*filename="([^"]*)"/i);
  const partContentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
  if (!disposition || !partContentType) return null;
  const fileStart = headerEnd + 4;
  const nextBoundary = body.indexOf(boundary, fileStart);
  if (nextBoundary < 0) return null;
  const fileEnd = nextBoundary - 2;
  return {
    fileName: disposition[1],
    contentType: partContentType,
    buffer: body.subarray(fileStart, fileEnd),
  };
}

router.post(
  "/audio/upload",
  express.raw({ type: "multipart/form-data", limit: `${MAX_AUDIO_SIZE + 1024 * 1024}b` }),
  async (request, response): Promise<void> => {
    if (!requireAdmin(request, response)) return;
    const audio = parseAudioMultipart(request);
    const extension = audio?.fileName.toLowerCase().split(".").pop() ?? "";
    const validExtensions = audio
      ? Object.entries(AUDIO_TYPES).find(([contentType]) => contentType === audio.contentType)?.[1]
      : undefined;
    if (
      !audio ||
      !validExtensions?.some((item) => item === extension) ||
      audio.buffer.length <= 0 ||
      audio.buffer.length > MAX_AUDIO_SIZE
    ) {
      response.status(400).json({ message: "MP3, OGG, WAV 오디오 파일만 업로드할 수 있으며 최대 크기는 20MB입니다." });
      return;
    }
    const objectPath = `/objects/uploads/audio/${randomUUID()}.${extension}`;
    await audioStorage.save(objectPath, audio.buffer, audio.contentType);
    response.json({
      audioAssetId: objectPath,
      audioUrl: `/api/storage${objectPath}`,
      audioFileName: audio.fileName,
      audioUploadToken: signAudioAsset(objectPath, Date.now() + PENDING_IMAGE_TTL_MS),
    });
  },
);

router.post("/audio/complete", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const objectPath = typeof body.objectPath === "string" ? body.objectPath : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const extensions = AUDIO_TYPES[contentType as keyof typeof AUDIO_TYPES];
  const extension = objectPath.toLowerCase().split(".").pop() ?? "";
  if (!objectPath.startsWith("/objects/uploads/audio/") ||
      !extensions || !extensions.some((item) => item === extension) ||
      !(await audioStorage.verifyAudio(objectPath, contentType, MAX_AUDIO_SIZE))) {
    if (objectPath.startsWith("/objects/uploads/audio/")) await audioStorage.remove(objectPath);
    response.status(400).json({ message: "오디오 파일 정보를 확인할 수 없습니다." });
    return;
  }
  response.json({
    audioAssetId: objectPath,
    audioUrl: `/api/storage${objectPath}`,
    audioUploadToken: signAudioAsset(objectPath, Date.now() + PENDING_IMAGE_TTL_MS),
  });
});

router.post("/audio/discard", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const audioAssetId = typeof body.audioAssetId === "string" ? body.audioAssetId : "";
  const audioUploadToken = typeof body.audioUploadToken === "string"
    ? body.audioUploadToken : null;
  if (!audioAssetId.startsWith("/objects/uploads/audio/") ||
      !validAudioAssetToken(audioAssetId, audioUploadToken)) {
    response.status(400).json({ message: "오디오 정보가 올바르지 않습니다." });
    return;
  }
  await removeAudioIfUnreferenced(audioAssetId);
  response.status(204).end();
});

function isGameMediaType(value: unknown): value is (typeof GAME_MEDIA_TYPES)[number] {
  return typeof value === "string" && GAME_MEDIA_TYPES.includes(value as (typeof GAME_MEDIA_TYPES)[number]);
}

function isCardFrameType(value: unknown): value is (typeof CARD_TYPES)[number] {
  return typeof value === "string" && CARD_TYPES.includes(value as (typeof CARD_TYPES)[number]);
}

function isCardFrameRarity(value: unknown): value is (typeof CARD_RARITIES)[number] {
  return typeof value === "string" && CARD_RARITIES.includes(value as (typeof CARD_RARITIES)[number]);
}

function frameNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

router.get("/card-frames", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const frames = await db.select().from(cardFrameDefinitionsTable)
    .orderBy(asc(cardFrameDefinitionsTable.cardType), asc(cardFrameDefinitionsTable.rarity));
  response.json({ frames, cardTypes: CARD_TYPES, rarities: CARD_RARITIES });
});

router.put("/card-frames/:cardType/:rarity", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const { cardType, rarity } = request.params;
  if (!isCardFrameType(cardType) || !isCardFrameRarity(rarity)) {
    response.status(400).json({ message: "카드 종류 또는 희귀도가 올바르지 않습니다." });
    return;
  }

  const existing = (await db.select().from(cardFrameDefinitionsTable)
    .where(and(
      eq(cardFrameDefinitionsTable.cardType, cardType),
      eq(cardFrameDefinitionsTable.rarity, rarity),
    ))
    .limit(1))[0];
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown>
    : {};
  const frameAssetId = body.frameAssetId === null || body.frameAssetId === undefined || body.frameAssetId === ""
    ? null
    : typeof body.frameAssetId === "string" ? body.frameAssetId : "";
  const frameUrl = frameAssetId
    ? typeof body.frameUrl === "string" ? body.frameUrl : ""
    : null;
  const frameUploadToken = typeof body.frameUploadToken === "string"
    ? body.frameUploadToken
    : null;
  const enabled = body.enabled === undefined ? existing?.enabled ?? true : body.enabled;
  const frameScale = frameNumber(body.frameScale, existing?.frameScale ?? 1.1, CARD_FRAME_SCALE_RANGE.min, CARD_FRAME_SCALE_RANGE.max);
  const frameOffsetX = frameNumber(body.frameOffsetX, existing?.frameOffsetX ?? 0, CARD_FRAME_OFFSET_RANGE.min, CARD_FRAME_OFFSET_RANGE.max);
  const frameOffsetY = frameNumber(body.frameOffsetY, existing?.frameOffsetY ?? 0, CARD_FRAME_OFFSET_RANGE.min, CARD_FRAME_OFFSET_RANGE.max);
  const isExistingAsset = Boolean(frameAssetId && frameAssetId === existing?.frameAssetId);

  if (
    (frameAssetId && (
      !frameAssetId.startsWith("/objects/uploads/card-images/") ||
      frameUrl !== imageUrlFor(frameAssetId) ||
      (!isExistingAsset && !(await validNewImageAsset(frameAssetId, frameUploadToken)))
    )) ||
    typeof enabled !== "boolean"
  ) {
    response.status(400).json({ message: "프레임 이미지 또는 설정값이 올바르지 않습니다." });
    return;
  }

  const [frame] = await db.insert(cardFrameDefinitionsTable)
    .values({
      id: existing?.id ?? randomUUID(),
      cardType,
      rarity,
      frameAssetId,
      frameUrl,
      enabled,
      frameScale,
      frameOffsetX,
      frameOffsetY,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [cardFrameDefinitionsTable.cardType, cardFrameDefinitionsTable.rarity],
      set: {
        frameAssetId,
        frameUrl,
        enabled,
        frameScale,
        frameOffsetX,
        frameOffsetY,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (existing?.frameAssetId && existing.frameAssetId !== frameAssetId) {
    await removeImageIfUnreferenced(existing.frameAssetId);
  }
  response.json({ frame });
});

router.delete("/card-frames/:cardType/:rarity", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const { cardType, rarity } = request.params;
  if (!isCardFrameType(cardType) || !isCardFrameRarity(rarity)) {
    response.status(400).json({ message: "카드 종류 또는 희귀도가 올바르지 않습니다." });
    return;
  }
  const existing = (await db.select().from(cardFrameDefinitionsTable)
    .where(and(
      eq(cardFrameDefinitionsTable.cardType, cardType),
      eq(cardFrameDefinitionsTable.rarity, rarity),
    ))
    .limit(1))[0];
  if (!existing) {
    response.status(204).end();
    return;
  }
  await db.delete(cardFrameDefinitionsTable).where(eq(cardFrameDefinitionsTable.id, existing.id));
  if (existing.frameAssetId) await removeImageIfUnreferenced(existing.frameAssetId);
  response.status(204).end();
});

function gameMediaConfig(mediaType: (typeof GAME_MEDIA_TYPES)[number]) {
  return mediaType === "BACKGROUND"
    ? {
        prefix: "/objects/uploads/game-backgrounds/",
        storage: backgroundImageStorage,
        types: GAME_BACKGROUND_TYPES,
        maxSize: MAX_CARD_IMAGE_SIZE,
      }
    : mediaType === "BGM"
      ? {
          prefix: "/objects/uploads/game-bgm/",
          storage: gameBgmStorage,
          types: GAME_BGM_TYPES,
          maxSize: MAX_AUDIO_SIZE,
        }
      : {
          prefix: "/objects/uploads/game-attack/",
          storage: gameAttackStorage,
          types: GAME_BGM_TYPES,
          maxSize: MAX_AUDIO_SIZE,
        };
}

function gameMediaExtensions(
  mediaType: (typeof GAME_MEDIA_TYPES)[number],
  contentType: string,
) {
  return mediaType === "BACKGROUND"
    ? GAME_BACKGROUND_TYPES[contentType as keyof typeof GAME_BACKGROUND_TYPES]
    : GAME_BGM_TYPES[contentType as keyof typeof GAME_BGM_TYPES];
}

router.get("/game-media", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const media = await db.select().from(gameMediaTable).orderBy(desc(gameMediaTable.createdAt));
  response.json({ media });
});

router.post("/game-media/uploads/request-url", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const mediaType = body.mediaType;
  const name = typeof body.name === "string" ? body.name : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : 0;
  if (!isGameMediaType(mediaType)) {
    response.status(400).json({ message: "미디어 종류가 올바르지 않습니다." });
    return;
  }
  const config = gameMediaConfig(mediaType);
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const validExtensions = gameMediaExtensions(mediaType, contentType);
  if (!validExtensions || !validExtensions.some((item) => item === extension) ||
      !Number.isInteger(size) || size <= 0 || size > config.maxSize) {
    response.status(400).json({
      message: mediaType === "BACKGROUND"
        ? `PNG, JPG, JPEG, WEBP 파일만 업로드할 수 있으며 최대 크기는 ${Math.floor(config.maxSize / 1024 / 1024)}MB입니다.`
        : "MP3, OGG, WAV 오디오 파일만 업로드할 수 있으며 최대 크기는 20MB입니다.",
    });
    return;
  }
  const upload = await config.storage.createUpload(extension);
  response.json({ ...upload, mediaType, maxSize: config.maxSize, contentType });
});

router.post("/game-media/uploads/complete", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const mediaType = body.mediaType;
  const objectPath = typeof body.objectPath === "string" ? body.objectPath : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!isGameMediaType(mediaType)) {
    response.status(400).json({ message: "미디어 종류가 올바르지 않습니다." });
    return;
  }
  const config = gameMediaConfig(mediaType);
  const extension = objectPath.toLowerCase().split(".").pop() ?? "";
  const validExtensions = gameMediaExtensions(mediaType, contentType);
  const validPath = objectPath.startsWith(config.prefix);
  const valid = mediaType === "BACKGROUND"
    ? validPath && Boolean(validExtensions?.some((item) => item === extension)) &&
      await backgroundImageStorage.verifyImage(objectPath, contentType, config.maxSize)
    : validPath && Boolean(validExtensions?.some((item) => item === extension)) &&
      await gameBgmStorage.verifyAudio(objectPath, contentType, config.maxSize);
  if (!valid) {
    if (validPath) await config.storage.remove(objectPath);
    response.status(400).json({ message: "업로드한 파일 정보를 확인할 수 없습니다." });
    return;
  }
  const uploadToken = signGameMediaAsset(mediaType, objectPath, Date.now() + PENDING_IMAGE_TTL_MS);
  response.json({
    mediaType,
    assetId: objectPath,
    assetUrl: `/api/storage${objectPath}`,
    uploadToken,
  });
});

router.post("/game-media/uploads/discard", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const mediaType = body.mediaType;
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  const uploadToken = typeof body.uploadToken === "string" ? body.uploadToken : null;
  if (!isGameMediaType(mediaType) || !validGameMediaAssetToken(mediaType, assetId, uploadToken)) {
    response.status(400).json({ message: "업로드 파일 정보가 올바르지 않습니다." });
    return;
  }
  const config = gameMediaConfig(mediaType);
  if (assetId.startsWith(config.prefix)) await config.storage.remove(assetId);
  response.status(204).end();
});

router.post("/game-media", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const mediaType = body.mediaType;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const assetId = typeof body.assetId === "string" ? body.assetId : "";
  const assetUrl = typeof body.assetUrl === "string" ? body.assetUrl : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const uploadToken = typeof body.uploadToken === "string" ? body.uploadToken : null;
  const width = typeof body.width === "number" ? body.width : null;
  const height = typeof body.height === "number" ? body.height : null;
  const volume = typeof body.volume === "number" ? body.volume : 100;
  const enabled = body.enabled === undefined ? true : body.enabled;
  const validDimensions = mediaType !== "BACKGROUND" ||
    (width !== null && height !== null &&
      Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0);
  if (!isGameMediaType(mediaType) || !name || name.length > 120 ||
      !assetUrl || !fileName || !contentType || !validGameMediaAssetToken(mediaType, assetId, uploadToken) ||
      !validDimensions ||
       (mediaType !== "BACKGROUND" && (!Number.isInteger(volume) || volume < 0 || volume > 100)) ||
      typeof enabled !== "boolean") {
    response.status(400).json({ message: "게임 미디어 정보가 올바르지 않습니다." });
    return;
  }
  const config = gameMediaConfig(mediaType);
  if (!assetId.startsWith(config.prefix) || assetUrl !== `/api/storage${assetId}`) {
    response.status(400).json({ message: "저장된 파일 경로가 올바르지 않습니다." });
    return;
  }
  const [media] = await db.insert(gameMediaTable).values({
    id: randomUUID(),
    mediaType,
    name,
    assetId,
    assetUrl,
    fileName,
    contentType,
    width: mediaType === "BACKGROUND" ? width as number : null,
    height: mediaType === "BACKGROUND" ? height as number : null,
     volume: mediaType !== "BACKGROUND" ? volume as number : 100,
    enabled,
  }).returning();
  response.status(201).json({ media });
});

router.patch("/game-media/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = request.params.id;
  const [existing] = await db.select().from(gameMediaTable).where(eq(gameMediaTable.id, id)).limit(1);
  if (!existing) {
    response.status(404).json({ message: "게임 미디어를 찾을 수 없습니다." });
    return;
  }
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown> : {};
  const name = body.name === undefined ? existing.name : typeof body.name === "string" ? body.name.trim() : "";
  const enabled = body.enabled === undefined ? existing.enabled : body.enabled;
  const volume = typeof body.volume === "number" ? body.volume : existing.volume;
  if (!name || name.length > 120 || typeof enabled !== "boolean" ||
      !Number.isInteger(volume) || volume < 0 || volume > 100) {
    response.status(400).json({ message: "게임 미디어 설정이 올바르지 않습니다." });
    return;
  }
  const [media] = await db.update(gameMediaTable).set({
    name,
    enabled,
     volume: existing.mediaType !== "BACKGROUND" ? volume : existing.volume,
    updatedAt: new Date(),
  }).where(eq(gameMediaTable.id, id)).returning();
  response.json({ media });
});

router.delete("/game-media/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = request.params.id;
  const [existing] = await db.select().from(gameMediaTable).where(eq(gameMediaTable.id, id)).limit(1);
  if (!existing) {
    response.status(404).json({ message: "게임 미디어를 찾을 수 없습니다." });
    return;
  }
  await db.delete(gameMediaTable).where(eq(gameMediaTable.id, id));
  const config = gameMediaConfig(existing.mediaType as (typeof GAME_MEDIA_TYPES)[number]);
  await config.storage.remove(existing.assetId);
  response.status(204).end();
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
  if (
    input.entranceAudioAssetId &&
    !(await validNewAudioAsset(input.entranceAudioAssetId, input.entranceAudioUploadToken))
  ) {
    response.status(400).json({ message: "검증된 등장 음악 업로드 정보가 필요합니다." });
    return;
  }
  const {
    imageUploadToken: _imageUploadToken,
    entranceAudioUploadToken: _entranceAudioUploadToken,
    ...cardValues
  } = input;

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
  if (existing.status === "PUBLISHED") {
    const effectPayloadError = await publishedEffectPayloadError(input);
    if (effectPayloadError) {
      response.status(422).json({ message: effectPayloadError });
      return;
    }
  }
  if (
    input.imageAssetId &&
    input.imageAssetId !== existing.imageAssetId &&
    !(await validNewImageAsset(input.imageAssetId, input.imageUploadToken))
  ) {
    response.status(400).json({ message: "검증된 이미지 업로드 정보가 필요합니다." });
    return;
  }
  if (
    input.entranceAudioAssetId &&
    input.entranceAudioAssetId !== existing.entranceAudioAssetId &&
    !(await validNewAudioAsset(input.entranceAudioAssetId, input.entranceAudioUploadToken))
  ) {
    response.status(400).json({ message: "검증된 등장 음악 업로드 정보가 필요합니다." });
    return;
  }
  const {
    imageUploadToken: _imageUploadToken,
    entranceAudioUploadToken: _entranceAudioUploadToken,
    ...cardValues
  } = input;

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
  if (
    existing.entranceAudioAssetId &&
    existing.entranceAudioAssetId !== input.entranceAudioAssetId
  ) {
    await removeAudioIfUnreferenced(existing.entranceAudioAssetId);
  }

  response.json({ card });
});

router.delete("/cards/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  if (!id) { response.status(400).json({ message: "카드 ID가 올바르지 않습니다." }); return; }
  const [existing] = await db.select().from(cardsTable).where(eq(cardsTable.id, id)).limit(1);
  if (!existing) { response.status(404).json({ message: "카드를 찾을 수 없습니다." }); return; }
  const dependents = await publishedCardDependents(id);
  if (dependents.length) {
    response.status(422).json({
      message: "공개 카드가 참조 중인 카드는 삭제할 수 없습니다.",
      dependents,
    });
    return;
  }
  const [deleted] = await db.delete(cardsTable).where(eq(cardsTable.id, id)).returning();
  if (!deleted) { response.status(404).json({ message: "카드를 찾을 수 없습니다." }); return; }
  if (existing.imageAssetId) await removeImageIfUnreferenced(existing.imageAssetId);
  if (existing.entranceAudioAssetId) await removeAudioIfUnreferenced(existing.entranceAudioAssetId);
  response.status(204).end();
});

router.post("/cards/:id/apply-mechanic-request", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const id = firstParam(request.params.id);
  const mechanicRequestId = request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>).mechanicRequestId : null;
  if (!id || typeof mechanicRequestId !== "string") {
    response.status(400).json({ message: "카드와 메커니즘 요청 정보가 필요합니다." }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [card] = await tx.select().from(cardsTable).where(eq(cardsTable.id, id)).limit(1);
      if (!card) throw new Error("CARD_NOT_FOUND");
      const [mechanicRequest] = await tx.select().from(mechanicRequestsTable).where(eq(mechanicRequestsTable.id, mechanicRequestId)).limit(1);
      if (!mechanicRequest) throw new Error("REQUEST_NOT_FOUND");
      const validation = validateMechanicCompletion(mechanicRequest.originalCardText);
      const decision = prepareCompletionApply(card, mechanicRequest.originalCardText, validation);
      if (!decision.ok) throw new Error(decision.reason);
      const [updatedCard] = await tx.update(cardsTable).set({
        text: decision.values.text,
        effectId: decision.values.effectId,
        effectConfig: decision.values.effectConfig,
        version: sql`${cardsTable.version} + 1`,
        updatedAt: new Date(),
      }).where(eq(cardsTable.id, id)).returning();
      const [updatedRequest] = await tx.update(mechanicRequestsTable).set({
        status: decision.values.status,
        resolvedEffectIds: decision.values.resolvedEffectIds,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(mechanicRequestsTable.id, mechanicRequestId)).returning();
      return { card: updatedCard, mechanicRequest: updatedRequest };
    });
    response.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      CARD_NOT_FOUND: "카드를 찾을 수 없습니다.", CARD_NOT_DRAFT: "DRAFT 카드에만 효과를 적용할 수 있습니다.",
      REQUEST_NOT_FOUND: "메커니즘 요청을 찾을 수 없습니다.", REVALIDATION_FAILED: "최신 검증을 통과하지 못해 효과를 적용하지 않았습니다.",
      SOURCE_TEXT_CHANGED: "카드 효과 문장이 요청 당시와 달라 최신 요청을 다시 분석해 주세요.",
    };
    if (messages[code]) { response.status(code === "CARD_NOT_FOUND" || code === "REQUEST_NOT_FOUND" ? 404 : 422).json({ message: messages[code] }); return; }
    throw error;
  }
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

  const [existing] = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.id, id))
    .limit(1);
  if (!existing) {
    response.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }
  if (status === "PUBLISHED") {
    const effectPayloadError = await publishedEffectPayloadError(existing);
    if (effectPayloadError) {
      response.status(422).json({ message: effectPayloadError });
      return;
    }
    const referenceErrors = await validatePublishedCardReferences(id);
    if (referenceErrors.length) {
      response.status(422).json({
        message: "공개하려면 참조 카드도 먼저 공개해야 합니다.",
        referenceErrors,
      });
      return;
    }
  }
  if (status !== "PUBLISHED") {
    const dependents = await publishedCardDependents(id);
    if (dependents.length) {
      response.status(422).json({
        message: "공개 카드가 참조 중인 카드는 비공개 또는 비활성화할 수 없습니다.",
        dependents,
      });
      return;
    }
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
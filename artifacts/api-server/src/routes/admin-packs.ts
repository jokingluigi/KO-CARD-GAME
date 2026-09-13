import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { cardsTable, championsTable, db, packDefinitionsTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { rollPack } from "./collection";

const router: IRouter = Router();
const STATUSES = ["DRAFT", "PUBLISHED", "DISABLED"] as const;
type PackInput = {
  name: string;
  description: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  cardsPerPack: number;
  normalRate: number;
  legendaryRate: number;
  championRate: number;
  normalCardPool: string[];
  legendaryCardPool: string[];
  championPool: string[];
};

function requireAdmin(request: Request, response: Response) {
  if (request.authUser?.role === "ADMIN") return request.authUser;
  response.status(request.authUser ? 403 : 401).json({ message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다." });
  return null;
}

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    request.authUser = user ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
});

function parseInput(value: unknown): PackInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = (key: string) => typeof input[key] === "string" ? (input[key] as string).trim() : "";
  const integer = (key: string, fallback: number) => {
    const candidate = input[key];
    return typeof candidate === "number" && Number.isInteger(candidate) ? candidate : fallback;
  };
  const ids = (key: string) => Array.isArray(input[key])
    ? [...new Set(input[key].filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))]
    : [];
  const name = text("name");
  const imageAssetId = text("imageAssetId") || null;
  const imageUrl = text("imageUrl") || null;
  const inputData = {
    name,
    description: text("description"),
    imageAssetId,
    imageUrl,
    cardsPerPack: integer("cardsPerPack", 1),
    normalRate: integer("normalRate", 90),
    legendaryRate: integer("legendaryRate", 7),
    championRate: integer("championRate", 3),
    normalCardPool: ids("normalCardPool"),
    legendaryCardPool: ids("legendaryCardPool"),
    championPool: ids("championPool"),
  };
  if (!name || name.length > 120 || inputData.cardsPerPack < 1 || inputData.cardsPerPack > 100 ||
      [inputData.normalRate, inputData.legendaryRate, inputData.championRate].some((rate) => rate < 0 || rate > 100)) {
    return null;
  }
  return inputData;
}

async function validationErrors(pack: PackInput | typeof packDefinitionsTable.$inferSelect): Promise<string[]> {
  const errors: string[] = [];
  if (!pack.name.trim()) errors.push("팩 이름을 입력해 주세요.");
  if (pack.cardsPerPack < 1) errors.push("cardsPerPack은 1 이상이어야 합니다.");
  if (pack.normalRate + pack.legendaryRate + pack.championRate !== 100) errors.push("등급별 확률 합계는 100%여야 합니다.");
  const [normal, legendary, champions] = await Promise.all([
    pack.normalCardPool.length ? db.select({ id: cardsTable.id }).from(cardsTable).where(and(
      inArray(cardsTable.id, pack.normalCardPool), eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.rarity, "NORMAL"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
    )) : [],
    pack.legendaryCardPool.length ? db.select({ id: cardsTable.id }).from(cardsTable).where(and(
      inArray(cardsTable.id, pack.legendaryCardPool), eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.rarity, "LEGENDARY"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
    )) : [],
    pack.championPool.length ? db.select({ id: championsTable.id }).from(championsTable).where(and(
      inArray(championsTable.id, pack.championPool), eq(championsTable.status, "PUBLISHED"),
    )) : [],
  ]);
  if (pack.normalRate > 0 && normal.length === 0) errors.push("NORMAL 확률이 0보다 크면 공개된 NORMAL Pool이 필요합니다.");
  if (pack.legendaryRate > 0 && legendary.length === 0) errors.push("LEGENDARY 확률이 0보다 크면 공개된 LEGENDARY Pool이 필요합니다.");
  if (pack.championRate > 0 && champions.length === 0) errors.push("CHAMPION 확률이 0보다 크면 공개된 Champion Pool이 필요합니다.");
  return errors;
}

router.get("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const packs = await db.select().from(packDefinitionsTable)
    .where(sql`${packDefinitionsTable.deletedAt} IS NULL`)
    .orderBy(asc(packDefinitionsTable.name));
  response.json({ packs });
});

router.get("/options", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [cards, champions] = await Promise.all([
    db.select().from(cardsTable).where(and(
      eq(cardsTable.status, "PUBLISHED"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
    )).orderBy(asc(cardsTable.name)),
    db.select().from(championsTable).where(eq(championsTable.status, "PUBLISHED")).orderBy(asc(championsTable.name)),
  ]);
  response.json({ cards, champions });
});

router.post("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = parseInput(request.body);
  if (!input) { response.status(400).json({ message: "팩 입력값을 확인해 주세요." }); return; }
  const [pack] = await db.insert(packDefinitionsTable).values({ id: randomUUID(), ...input, status: "DRAFT", version: 1 }).returning();
  response.status(201).json({ pack, validationErrors: await validationErrors(pack!) });
});

router.patch("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = parseInput(request.body);
  if (!input) { response.status(400).json({ message: "팩 입력값을 확인해 주세요." }); return; }
  const [pack] = await db.update(packDefinitionsTable).set({
    ...input, version: sql`${packDefinitionsTable.version} + 1`, updatedAt: new Date(),
  }).where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).returning();
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  response.json({ pack, validationErrors: await validationErrors(pack) });
});

router.post("/:id/duplicate", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [source] = await db.select().from(packDefinitionsTable).where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).limit(1);
  if (!source) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, ...copy } = source;
  const [pack] = await db.insert(packDefinitionsTable).values({ ...copy, id: randomUUID(), name: `${source.name} Copy`, status: "DRAFT", version: 1 }).returning();
  response.status(201).json({ pack });
});

router.post("/:id/status", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const status = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>).status : null;
  if (!STATUSES.includes(status as typeof STATUSES[number])) { response.status(400).json({ message: "팩 상태를 확인해 주세요." }); return; }
  const [existing] = await db.select().from(packDefinitionsTable).where(eq(packDefinitionsTable.id, request.params.id)).limit(1);
  if (!existing) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  if (status === "PUBLISHED") {
    const errors = await validationErrors(existing);
    if (errors.length) { response.status(422).json({ message: errors.join(" "), errors }); return; }
  }
  const [pack] = await db.update(packDefinitionsTable).set({ status: status as string, version: sql`${packDefinitionsTable.version} + 1`, updatedAt: new Date() })
    .where(eq(packDefinitionsTable.id, request.params.id)).returning();
  response.json({ pack });
});

router.post("/:id/preview", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [pack] = await db.select().from(packDefinitionsTable).where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).limit(1);
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  const errors = await validationErrors(pack);
  if (errors.length) { response.status(422).json({ message: errors.join(" "), errors }); return; }
  response.json({ rewards: (await rollPack(pack)).map((reward) => reward.rewardType === "CHAMPION_UNLOCK"
    ? { rewardType: reward.rewardType, championDefinitionId: reward.championDefinitionId, champion: reward.champion }
    : { rewardType: reward.rewardType, cardDefinitionId: reward.cardDefinitionId, card: reward.card }) });
});

router.delete("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [pack] = await db.update(packDefinitionsTable).set({ deletedAt: new Date(), status: "DISABLED", updatedAt: new Date() })
    .where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).returning();
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  response.status(204).end();
});

export default router;
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  cardsTable,
  cardSkinDefinitionsTable,
  championsTable,
  db,
  packDefinitionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
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
  starterRewardQuantity: number;
  normalRate: number;
  legendaryRate: number;
  championRate: number;
  skinChance: number;
  normalCardPool: string[];
  legendaryCardPool: string[];
  championPool: string[];
  skinPool: string[];
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
  const starterRewardQuantity = input.starterRewardQuantity === undefined
    ? 0
    : integer("starterRewardQuantity", -1);
  const inputData = {
    name,
    description: text("description"),
    imageAssetId,
    imageUrl,
    cardsPerPack: integer("cardsPerPack", 1),
    starterRewardQuantity,
    normalRate: integer("normalRate", 90),
    legendaryRate: integer("legendaryRate", 7),
    championRate: integer("championRate", 3),
    skinChance: integer("skinChance", 0),
    normalCardPool: ids("normalCardPool"),
    legendaryCardPool: ids("legendaryCardPool"),
    championPool: ids("championPool"),
    skinPool: ids("skinPool"),
  };
  if (!name || name.length > 120 || inputData.cardsPerPack < 1 || inputData.cardsPerPack > 100 ||
      inputData.starterRewardQuantity < 0 || inputData.starterRewardQuantity > 999 ||
      [inputData.normalRate, inputData.legendaryRate, inputData.championRate, inputData.skinChance].some((rate) => rate < 0 || rate > 100)) {
    return null;
  }
  return inputData;
}

async function validationErrors(pack: PackInput | typeof packDefinitionsTable.$inferSelect): Promise<string[]> {
  const errors: string[] = [];
  if (!pack.name.trim()) errors.push("팩 이름을 입력해 주세요.");
  if (pack.cardsPerPack < 1) errors.push("cardsPerPack은 1 이상이어야 합니다.");
  if (pack.normalRate + pack.legendaryRate + pack.championRate !== 100) errors.push("등급별 확률 합계는 100%여야 합니다.");
  if (pack.skinChance < 0 || pack.skinChance > 100) errors.push("Skin Chance는 0~100%여야 합니다.");
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
  const skins = pack.skinPool.length ? await db.select({ id: cardSkinDefinitionsTable.id }).from(cardSkinDefinitionsTable)
    .innerJoin(cardsTable, eq(cardsTable.id, cardSkinDefinitionsTable.cardDefinitionId))
    .where(and(
      inArray(cardSkinDefinitionsTable.id, pack.skinPool),
      eq(cardSkinDefinitionsTable.status, "PUBLISHED"),
      eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.isToken, false),
      eq(cardsTable.isChampionToken, false),
    )) : [];
  if (pack.normalRate > 0 && normal.length === 0) errors.push("NORMAL 확률이 0보다 크면 공개된 NORMAL Pool이 필요합니다.");
  if (pack.legendaryRate > 0 && legendary.length === 0) errors.push("LEGENDARY 확률이 0보다 크면 공개된 LEGENDARY Pool이 필요합니다.");
  if (pack.championRate > 0 && champions.length === 0) errors.push("CHAMPION 확률이 0보다 크면 공개된 Champion Pool이 필요합니다.");
  if (pack.skinChance > 0 && skins.length === 0) errors.push("Skin Chance가 0보다 크면 공개된 Skin Pool이 필요합니다.");
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
  const [cards, champions, skins] = await Promise.all([
    db.select().from(cardsTable).where(and(
      eq(cardsTable.status, "PUBLISHED"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
    )).orderBy(asc(cardsTable.name)),
    db.select().from(championsTable).where(eq(championsTable.status, "PUBLISHED")).orderBy(asc(championsTable.name)),
    db.select({
      id: cardSkinDefinitionsTable.id,
      name: cardSkinDefinitionsTable.name,
      cardDefinitionId: cardSkinDefinitionsTable.cardDefinitionId,
      imageUrl: cardSkinDefinitionsTable.imageUrl,
      cardName: cardsTable.name,
    }).from(cardSkinDefinitionsTable)
      .innerJoin(cardsTable, eq(cardsTable.id, cardSkinDefinitionsTable.cardDefinitionId))
      .where(and(
        eq(cardSkinDefinitionsTable.status, "PUBLISHED"),
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      )).orderBy(asc(cardSkinDefinitionsTable.name)),
  ]);
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    nickname: usersTable.nickname,
    role: usersTable.role,
  }).from(usersTable).orderBy(asc(usersTable.nickname));
  response.json({ cards, champions, skins, users });
});

router.post("/:id/grant", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const userId = request.body && typeof request.body.userId === "string" ? request.body.userId : "";
  const quantity = request.body && Number.isInteger(request.body.quantity) ? request.body.quantity : 0;
  if (!userId || quantity < 1 || quantity > 999) {
    response.status(400).json({ message: "사용자와 1~999 사이의 지급 수량을 확인해 주세요." });
    return;
  }
  const [[pack], [user]] = await Promise.all([
    db.select({ id: packDefinitionsTable.id, name: packDefinitionsTable.name })
      .from(packDefinitionsTable)
      .where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`))
      .limit(1),
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
  ]);
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  if (!user) { response.status(404).json({ message: "사용자를 찾을 수 없습니다." }); return; }
  const [inventory] = await db.insert(userPackInventoryTable).values({
    userId,
    packDefinitionId: pack.id,
    quantity,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userPackInventoryTable.userId, userPackInventoryTable.packDefinitionId],
    set: {
      quantity: sql`${userPackInventoryTable.quantity} + ${quantity}`,
      updatedAt: new Date(),
    },
  }).returning();
  response.status(201).json({ inventory, pack });
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
  const [pack] = await db.insert(packDefinitionsTable).values({
    ...copy,
    id: randomUUID(),
    name: `${source.name} Copy`,
    starterRewardQuantity: 0,
    status: "DRAFT",
    version: 1,
  }).returning();
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
    : reward.rewardType === "SKIN"
      ? { rewardType: reward.rewardType, skinDefinitionId: reward.skinDefinitionId, skin: reward.skin, card: reward.card }
      : { rewardType: reward.rewardType, cardDefinitionId: reward.cardDefinitionId, card: reward.card }) });
});

router.post("/:id/preview/forced", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [pack] = await db.select().from(packDefinitionsTable)
    .where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).limit(1);
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  const slots = Array.isArray(request.body?.slots) ? request.body.slots : [];
  if (slots.length !== pack.cardsPerPack) {
    response.status(400).json({ message: `강제 결과는 ${pack.cardsPerPack}개 슬롯이 필요합니다.` });
    return;
  }
  const rewards: Array<Record<string, unknown>> = [];
  for (const slot of slots) {
    const type = slot && typeof slot.type === "string" ? slot.type : "";
    const id = slot && typeof slot.id === "string" ? slot.id : "";
    if (type === "NORMAL_CARD" || type === "LEGENDARY_CARD") {
      const pool = type === "NORMAL_CARD" ? pack.normalCardPool : pack.legendaryCardPool;
      const [card] = await db.select().from(cardsTable).where(and(
        eq(cardsTable.id, id), inArray(cardsTable.id, pool), eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.rarity, type === "NORMAL_CARD" ? "NORMAL" : "LEGENDARY"),
        eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
      )).limit(1);
      if (!card) { response.status(422).json({ message: "강제 지정 카드가 현재 팩 Pool에 없습니다." }); return; }
      rewards.push({ rewardType: type, cardDefinitionId: card.id, card });
    } else if (type === "CHAMPION_UNLOCK") {
      const [champion] = await db.select().from(championsTable).where(and(
        eq(championsTable.id, id), inArray(championsTable.id, pack.championPool), eq(championsTable.status, "PUBLISHED"),
      )).limit(1);
      if (!champion) { response.status(422).json({ message: "강제 지정 Champion이 현재 팩 Pool에 없습니다." }); return; }
      rewards.push({ rewardType: type, championDefinitionId: champion.id, champion });
    } else if (type === "SKIN") {
      const [skin] = await db.select({ skin: cardSkinDefinitionsTable, card: cardsTable })
        .from(cardSkinDefinitionsTable).innerJoin(cardsTable, eq(cardsTable.id, cardSkinDefinitionsTable.cardDefinitionId))
        .where(and(
          eq(cardSkinDefinitionsTable.id, id), inArray(cardSkinDefinitionsTable.id, pack.skinPool),
          eq(cardSkinDefinitionsTable.status, "PUBLISHED"), eq(cardsTable.status, "PUBLISHED"),
          eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
        )).limit(1);
      if (!skin) { response.status(422).json({ message: "강제 지정 Skin이 현재 팩 Pool에 없습니다." }); return; }
      rewards.push({ rewardType: type, skinDefinitionId: skin.skin.id, skin: skin.skin, card: skin.card });
    } else {
      response.status(400).json({ message: "강제 결과 타입을 확인해 주세요." });
      return;
    }
  }
  response.json({ rewards });
});

router.delete("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [pack] = await db.update(packDefinitionsTable).set({ deletedAt: new Date(), status: "DISABLED", updatedAt: new Date() })
    .where(and(eq(packDefinitionsTable.id, request.params.id), sql`${packDefinitionsTable.deletedAt} IS NULL`)).returning();
  if (!pack) { response.status(404).json({ message: "팩을 찾을 수 없습니다." }); return; }
  response.status(204).end();
});

export default router;
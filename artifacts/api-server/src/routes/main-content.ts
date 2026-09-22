import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  gameMediaTable,
  noticesTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { filterAndSortPublicNotices, selectActiveMainMedia, validateNoticeInput } from "./main-content-policy";

const publicRouter: IRouter = Router();
const adminRouter: IRouter = Router();

function requireAdmin(request: Request, response: Response): boolean {
  if (request.authUser?.role === "ADMIN") return true;
  response.status(request.authUser ? 403 : 401).json({
    message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다.",
  });
  return false;
}

async function publicNotices() {
  const notices = await db.select({
    id: noticesTable.id,
    title: noticesTable.title,
    body: noticesTable.body,
    displayOrder: noticesTable.displayOrder,
    enabled: noticesTable.enabled,
    createdAt: noticesTable.createdAt,
    updatedAt: noticesTable.updatedAt,
  }).from(noticesTable)
    .where(eq(noticesTable.enabled, true))
    .orderBy(desc(noticesTable.displayOrder), desc(noticesTable.createdAt));
  return filterAndSortPublicNotices(notices);
}

const publicMediaFields = {
  id: gameMediaTable.id,
  mediaType: gameMediaTable.mediaType,
  name: gameMediaTable.name,
  assetUrl: gameMediaTable.assetUrl,
  width: gameMediaTable.width,
  height: gameMediaTable.height,
  volume: gameMediaTable.volume,
};

async function activeMainMedia(mediaType: "BACKGROUND" | "BGM") {
  const media = await db.select({
    ...publicMediaFields,
    mainEnabled: gameMediaTable.mainEnabled,
    enabled: gameMediaTable.enabled,
    createdAt: gameMediaTable.createdAt,
    updatedAt: gameMediaTable.updatedAt,
  })
    .from(gameMediaTable)
    .where(and(
      eq(gameMediaTable.mediaType, mediaType),
      eq(gameMediaTable.enabled, true),
      eq(gameMediaTable.mainEnabled, true),
    ))
    .orderBy(desc(gameMediaTable.updatedAt), desc(gameMediaTable.createdAt))
  const selected = selectActiveMainMedia(media);
  if (!selected) return null;
  return {
    id: selected.id,
    mediaType: selected.mediaType,
    name: selected.name,
    assetUrl: selected.assetUrl,
    width: selected.width,
    height: selected.height,
    volume: selected.volume,
  };
}

publicRouter.get("/notices", async (_request, response): Promise<void> => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ notices: await publicNotices() });
});

publicRouter.get("/main-content", async (_request, response): Promise<void> => {
  const [notices, background, bgm] = await Promise.all([
    publicNotices(),
    activeMainMedia("BACKGROUND"),
    activeMainMedia("BGM"),
  ]);
  response.setHeader("Cache-Control", "no-store");
  response.json({ notices, background, bgm });
});

adminRouter.use(async (request, _response, next) => {
  try {
    request.authUser = (await getAuthenticatedUser(request)) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  response.json({ notices: await db.select().from(noticesTable).orderBy(desc(noticesTable.createdAt)) });
});

adminRouter.post("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateNoticeInput(request.body);
  if (!input) {
    response.status(400).json({ message: "공지 입력값을 확인해 주세요." });
    return;
  }
  const [notice] = await db.insert(noticesTable).values({
    id: randomUUID(),
    ...input,
  }).returning();
  response.status(201).json({ notice });
});

adminRouter.patch("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateNoticeInput(request.body);
  if (!input) {
    response.status(400).json({ message: "공지 입력값을 확인해 주세요." });
    return;
  }
  const [notice] = await db.update(noticesTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(noticesTable.id, request.params.id))
    .returning();
  if (!notice) {
    response.status(404).json({ message: "공지를 찾을 수 없습니다." });
    return;
  }
  response.json({ notice });
});

export { adminRouter as adminNoticesRouter, publicRouter as mainContentRouter };
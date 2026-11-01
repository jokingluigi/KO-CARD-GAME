import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, gameMediaTable } from "@workspace/db";
import { BackgroundImageStorage } from "./object-storage";
import {
  defaultHomeMenuLayout,
  parseHomeMenuLayout,
  type HomeMenuLayout,
} from "@workspace/cosmetics";
const layoutId = "home-battle-menu-layout",
  storage = new BackgroundImageStorage();
let cached: { path: string; layout: HomeMenuLayout } | null = null;
type Reader = Pick<typeof db, "select">;
export async function readHomeMenuLayout(
  database: Reader = db,
): Promise<HomeMenuLayout> {
  const [row] = await database
    .select()
    .from(gameMediaTable)
    .where(eq(gameMediaTable.id, layoutId))
    .limit(1);
  if (!row) return defaultHomeMenuLayout();
  if (
    row.mediaType !== "HOME_MENU_LAYOUT" ||
    !/^\/objects\/uploads\/game-backgrounds\/[a-f0-9-]+\.json$/.test(
      row.assetId,
    )
  )
    throw new Error("홈 메뉴 설정 파일 경로를 확인해 주세요.");
  if (cached?.path === row.assetId) return structuredClone(cached.layout);
  const object = await storage.download(row.assetId);
  if (!object || object.buffer.length > 32000)
    throw new Error("홈 메뉴 설정을 읽지 못했습니다.");
  const parsed = parseHomeMenuLayout(
    JSON.parse(object.buffer.toString("utf8")),
  );
  if (!parsed) throw new Error("홈 메뉴 설정 형식이 올바르지 않습니다.");
  cached = { path: row.assetId, layout: parsed };
  return structuredClone(parsed);
}
export async function publicHomeMenuArtwork() {
  const layout = await readHomeMenuLayout();
  if (!layout.imageId) return { ...layout, imageUrl: null };
  const [image] = await db
    .select()
    .from(gameMediaTable)
    .where(eq(gameMediaTable.id, layout.imageId))
    .limit(1);
  return {
    ...layout,
    imageUrl: image?.mediaType === "HOME_MENU_ART" ? image.assetUrl : null,
  };
}
export async function saveHomeMenuLayout(layout: HomeMenuLayout) {
  const path = `/objects/uploads/game-backgrounds/${randomUUID()}.json`;
  await storage.save(
    path,
    Buffer.from(JSON.stringify(layout)),
    "application/json",
  );
  let oldPath: string | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('home-menu-layout'))`,
      );
      if (layout.imageId) {
        const [image] = await tx
          .select()
          .from(gameMediaTable)
          .where(eq(gameMediaTable.id, layout.imageId))
          .limit(1);
        if (image?.mediaType !== "HOME_MENU_ART")
          throw new Error("등록된 메뉴 이미지를 선택해 주세요.");
      }
      const [old] = await tx
        .select()
        .from(gameMediaTable)
        .where(eq(gameMediaTable.id, layoutId))
        .limit(1);
      if (
        old?.mediaType === "HOME_MENU_LAYOUT" &&
        /^\/objects\/uploads\/game-backgrounds\/[a-f0-9-]+\.json$/.test(
          old.assetId,
        )
      )
        oldPath = old.assetId;
      const record = {
        mediaType: "HOME_MENU_LAYOUT",
        name: "홈 대전 모드 메뉴 설정",
        assetId: path,
        assetUrl: `/api/storage${path}`,
        fileName: "home-menu.json",
        contentType: "application/json",
        gameEnabled: false,
        titleEnabled: false,
        enabled: false,
        mainEnabled: false,
        updatedAt: new Date(),
      };
      await tx
        .insert(gameMediaTable)
        .values({ id: layoutId, ...record })
        .onConflictDoUpdate({ target: gameMediaTable.id, set: record });
    });
  } catch (e) {
    await storage.remove(path).catch(() => {});
    throw e;
  }
  cached = { path, layout: structuredClone(layout) };
  if (oldPath && oldPath !== path)
    await storage.remove(oldPath).catch(() => {});
}
export async function removeHomeMenuImage(id: string) {
  let path: string | undefined;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('home-menu-layout'))`,
    );
    const layout = await readHomeMenuLayout(tx);
    if (layout.imageId === id)
      throw new Error(
        "사용 중인 이미지입니다. 먼저 홈 메뉴에서 등록 해제하고 저장하세요.",
      );
    const [row] = await tx
      .select()
      .from(gameMediaTable)
      .where(eq(gameMediaTable.id, id))
      .limit(1);
    if (!row || row.mediaType !== "HOME_MENU_ART")
      throw new Error("메뉴 이미지를 찾을 수 없습니다.");
    path = row.assetId;
    await tx.delete(gameMediaTable).where(eq(gameMediaTable.id, id));
  });
  if (path) await storage.remove(path).catch(() => {});
}

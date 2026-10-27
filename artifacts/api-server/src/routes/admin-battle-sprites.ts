import { Router } from "express";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, championsTable, cosmeticItemsTable } from "@workspace/db";
import {
  championSkinArtwork,
  parseBattleSprite,
  spriteFrames,
} from "@workspace/cosmetics";
import { getAuthenticatedUser } from "../lib/auth";
import { verifyCatalogAssets } from "./cosmetics";
const router = Router();
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, canonical(v)]),
        )
      : value;
const revision = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value ?? null)))
    .digest("hex");
router.use(async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (user?.role !== "ADMIN") {
      res
        .status(user ? 403 : 401)
        .json({ message: "관리자 권한이 필요합니다." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/", async (_req, res, next) => {
  try {
    const champions = await db.select().from(championsTable);
    const skins = await db
      .select()
      .from(cosmeticItemsTable)
      .where(eq(cosmeticItemsTable.type, "CHAMPION_SKIN"));
    const targets = champions.flatMap((c) => [
      {
        key: "default:" + c.id,
        kind: "default",
        id: c.id,
        championId: c.id,
        championName: c.name,
        name: "기본 외형",
        imageUrl: c.imageUrl,
        config: parseBattleSprite(c.presentationLines?.BATTLE_SPRITE),
        revision: revision(c.presentationLines?.BATTLE_SPRITE),
      },
      ...skins
        .filter((s) => s.targetId === c.id)
        .map((s) => ({
          key: "skin:" + s.id,
          kind: "skin",
          id: s.id,
          championId: c.id,
          championName: c.name,
          name: s.name,
          imageUrl: championSkinArtwork(s.imageAssets),
          config: parseBattleSprite(s.imageAssets.__battle),
          revision: revision(s.imageAssets.__battle),
        })),
    ]);
    res.json({ targets });
  } catch (e) {
    next(e);
  }
});
router.patch("/:kind/:id", async (req, res, next) => {
  try {
    const kind = String(req.params.kind),
      id = String(req.params.id);
    if (
      !["default", "skin"].includes(kind) ||
      typeof req.body?.revision !== "string" ||
      !Object.hasOwn(req.body ?? {}, "sprite")
    ) {
      res
        .status(400)
        .json({ message: "스프라이트 저장 요청을 확인해 주세요." });
      return;
    }
    const sprite =
      req.body.sprite === null ? null : parseBattleSprite(req.body.sprite);
    if (req.body.sprite !== null && !sprite) {
      res.status(400).json({
        message: "스프라이트 세트·표정·각성 설정이 올바르지 않습니다.",
      });
      return;
    }
    // Only new image URLs need another storage download. Framing/reaction edits
    // reuse server-owned, previously verified URLs, never a client allow-list.
    let previous: unknown;
    if (kind === "default") {
      const [row] = await db
        .select({ lines: championsTable.presentationLines })
        .from(championsTable)
        .where(eq(championsTable.id, id));
      if (!row) {
        res.status(404).json({ message: "챔피언을 찾을 수 없습니다." });
        return;
      }
      previous = row.lines?.BATTLE_SPRITE;
    } else {
      const [row] = await db
        .select({ assets: cosmeticItemsTable.imageAssets })
        .from(cosmeticItemsTable)
        .where(
          and(
            eq(cosmeticItemsTable.id, id),
            eq(cosmeticItemsTable.type, "CHAMPION_SKIN"),
          ),
        );
      if (!row) {
        res.status(404).json({ message: "챔피언 스킨을 찾을 수 없습니다." });
        return;
      }
      previous = row.assets.__battle;
    }
    const oldConfig = parseBattleSprite(previous);
    if (sprite)
      await verifyCatalogAssets(
        { __battle: JSON.stringify(sprite) },
        new Set(
          oldConfig ? spriteFrames(oldConfig).map((frame) => frame.url) : [],
        ),
      );
    const result = await db.transaction(async (tx) => {
      if (kind === "default") {
        const [row] = await tx
          .select()
          .from(championsTable)
          .where(eq(championsTable.id, id))
          .for("update");
        if (!row) return { status: 404, message: "챔피언을 찾을 수 없습니다." };
        if (
          revision(row.presentationLines?.BATTLE_SPRITE) !== req.body.revision
        )
          return {
            status: 409,
            message:
              "다른 창에서 스프라이트가 변경됐습니다. 다시 불러온 뒤 저장해 주세요.",
          };
        const lines = { ...row.presentationLines };
        if (sprite) lines.BATTLE_SPRITE = sprite;
        else delete lines.BATTLE_SPRITE;
        await tx
          .update(championsTable)
          .set({
            presentationLines: lines,
            version: sql`${championsTable.version}+1`,
            updatedAt: new Date(),
          })
          .where(eq(championsTable.id, id));
        return { status: 200, config: sprite, revision: revision(sprite) };
      }
      const [row] = await tx
        .select()
        .from(cosmeticItemsTable)
        .where(
          and(
            eq(cosmeticItemsTable.id, id),
            eq(cosmeticItemsTable.type, "CHAMPION_SKIN"),
          ),
        )
        .for("update");
      if (!row)
        return { status: 404, message: "챔피언 스킨을 찾을 수 없습니다." };
      if (revision(row.imageAssets.__battle) !== req.body.revision)
        return {
          status: 409,
          message:
            "다른 창에서 스프라이트가 변경됐습니다. 다시 불러온 뒤 저장해 주세요.",
        };
      const assets = { ...row.imageAssets };
      if (sprite) assets.__battle = JSON.stringify(sprite);
      else delete assets.__battle;
      await tx
        .update(cosmeticItemsTable)
        .set({ imageAssets: assets, updatedAt: new Date() })
        .where(eq(cosmeticItemsTable.id, id));
      return {
        status: 200,
        config: sprite,
        revision: revision(assets.__battle),
      };
    });
    res.status(result.status).json(result);
  } catch (e) {
    if ((e as { status?: number }).status === 400) {
      res.status(400).json({ message: (e as Error).message });
      return;
    }
    next(e);
  }
});
export default router;

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cardsTable, championsTable, draftSettingsTable } from "@workspace/db";
import {
  parseDraftConfig,
  DEFAULT_DRAFT_CONFIG,
  validateDraftPool,
  selectableCards,
  selectableChampions,
} from "@workspace/game-engine";
import { getAuthenticatedUser } from "../lib/auth";
import {
  DraftError,
  draftSettings,
  draftCatalog,
  startDraft,
  currentDraft,
  mutateDraft,
  draftView,
  draftBattleView,
  draftRewards,
} from "../lib/draft-service";
const router: IRouter = Router();
router.use(async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (req.baseUrl.endsWith("/admin/draft") && user.role !== "ADMIN") {
      res.status(403).json({ message: "관리자만 접근할 수 있습니다." });
      return;
    }
    req.authUser = user;
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/availability", async (_req, res, next) => {
  try { res.json({ enabled: (await draftSettings()).enabled }); }
  catch (error) { next(error); }
});
router.get("/", async (req, res, next) => {
  try {
    const settings = await draftSettings(),
      catalog = await draftCatalog(settings.config);
    let poolError: string | null = null;
    try {
      validateDraftPool(catalog);
    } catch (e) {
      poolError = e instanceof Error ? e.message : "카드 풀을 확인해 주세요.";
    }
    res.json({
      ...settings,
      cards: selectableCards({
        ...catalog,
        config: { ...settings.config, excludedCardIds: [] },
      }),
      champions: selectableChampions({
        ...catalog,
        config: { ...settings.config, excludedChampionIds: [] },
      }),
      poolError,
      currentId: await currentDraft(req.authUser!.id),
    });
  } catch (e) {
    next(e);
  }
});
router.get("/card-selection", async (req, res, next) => {
  try {
    if (req.authUser?.role !== "ADMIN") { res.status(403).json({ message: "관리자만 접근할 수 있습니다." }); return; }
    res.json({ excludedCardIds: (await draftSettings()).config.excludedCardIds });
  } catch (error) { next(error); }
});
router.patch("/cards/:cardId/selection", async (req, res, next) => {
  try {
    if (req.authUser?.role !== "ADMIN") { res.status(403).json({ message: "관리자만 접근할 수 있습니다." }); return; }
    if (typeof req.body?.excluded !== "boolean")
      throw new DraftError("INVALID_CONFIG", "카드 선택 제외 설정을 확인해 주세요.");
    const cardId = String(req.params.cardId);
    const [card] = await db.select({ id: cardsTable.id }).from(cardsTable).where(eq(cardsTable.id, cardId));
    if (!card) throw new DraftError("NOT_FOUND", "카드를 찾을 수 없습니다.", 404);
    const excludedCardIds = await db.transaction(async (tx) => {
      await tx.insert(draftSettingsTable).values({ id: "global", enabled: false, config: DEFAULT_DRAFT_CONFIG as unknown as Record<string, unknown> }).onConflictDoNothing();
      const [settings] = await tx.select().from(draftSettingsTable).where(eq(draftSettingsTable.id, "global")).for("update");
      const config = parseDraftConfig(settings.config);
      const ids = new Set(config.excludedCardIds);
      if (req.body.excluded) ids.add(cardId); else ids.delete(cardId);
      config.excludedCardIds = [...ids];
      await tx.update(draftSettingsTable).set({ config: config as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(draftSettingsTable.id, "global"));
      return config.excludedCardIds;
    });
    res.json({ excludedCardIds });
  } catch (error) { next(error); }
});
router.get("/champion-selection", async (req, res, next) => {
  try {
    if (req.authUser?.role !== "ADMIN") { res.status(403).json({ message: "관리자만 접근할 수 있습니다." }); return; }
    res.json({ excludedChampionIds: (await draftSettings()).config.excludedChampionIds });
  } catch (error) { next(error); }
});
router.patch("/champions/:championId/selection", async (req, res, next) => {
  try {
    if (req.authUser?.role !== "ADMIN") { res.status(403).json({ message: "관리자만 접근할 수 있습니다." }); return; }
    if (typeof req.body?.excluded !== "boolean")
      throw new DraftError("INVALID_CONFIG", "챔피언 선택 제외 설정을 확인해 주세요.");
    const championId = String(req.params.championId);
    const [champion] = await db.select({ id: championsTable.id }).from(championsTable).where(eq(championsTable.id, championId));
    if (!champion) throw new DraftError("NOT_FOUND", "챔피언을 찾을 수 없습니다.", 404);
    const excludedChampionIds = await db.transaction(async (tx) => {
      await tx.insert(draftSettingsTable).values({ id: "global", enabled: false, config: DEFAULT_DRAFT_CONFIG as unknown as Record<string, unknown> }).onConflictDoNothing();
      const [settings] = await tx.select().from(draftSettingsTable).where(eq(draftSettingsTable.id, "global")).for("update");
      const config = parseDraftConfig(settings.config);
      const ids = new Set(config.excludedChampionIds);
      if (req.body.excluded) ids.add(championId); else ids.delete(championId);
      config.excludedChampionIds = [...ids];
      await tx.update(draftSettingsTable).set({ config: config as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(draftSettingsTable.id, "global"));
      return config.excludedChampionIds;
    });
    res.json({ excludedChampionIds });
  } catch (error) { next(error); }
});
router.put("/settings", async (req, res, next) => {
  try {
    if (req.authUser?.role !== "ADMIN") {
      res.status(403).json({ message: "설정은 관리자만 변경할 수 있습니다." });
      return;
    }
    if (typeof req.body?.enabled !== "boolean")
      throw new DraftError("INVALID_CONFIG", "ON/OFF 설정을 확인해 주세요.");
    const config = parseDraftConfig(
      req.body.config ?? (await draftSettings()).config,
    );
    if (req.body.enabled) validateDraftPool(await draftCatalog(config));
    await db
      .insert(draftSettingsTable)
      .values({
        id: "global",
        enabled: req.body.enabled,
        config: config as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: draftSettingsTable.id,
        set: {
          enabled: req.body.enabled,
          config: config as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
    res.json({ enabled: req.body.enabled, config });
  } catch (e) {
    next(e);
  }
});
router.post("/matchmaking", async (req, res, next) => {
  try {
    const id = await startDraft(req.authUser!.id, req.authUser!.nickname, "PVP", true);
    res.json(draftView(await mutateDraft(req.authUser!.id, id)));
  } catch (error) { next(error); }
});
router.post("/sessions", async (req, res, next) => {
  try {
    if (req.body?.mode !== "AI" && req.body?.mode !== "PVP")
      throw new DraftError("INVALID_MODE", "AI 또는 PvP를 선택해 주세요.");
    const id = await startDraft(
      req.authUser!.id,
      req.authUser!.nickname,
      req.body.mode,
    );
    res.status(201).json(draftView(await mutateDraft(req.authUser!.id, id)));
  } catch (e) {
    next(e);
  }
});
router.get("/sessions/:id", async (req, res, next) => {
  try {
    res.json(
      draftView(await mutateDraft(req.authUser!.id, String(req.params.id))),
    );
  } catch (e) {
    next(e);
  }
});
router.post("/sessions/:id/commands", async (req, res, next) => {
  try {
    const r = await mutateDraft(req.authUser!.id, String(req.params.id), {
      ...req.body,
      name: req.authUser!.nickname,
    });
    res.json(draftView(r));
  } catch (e) {
    next(e);
  }
});
// A room invitation contains only an ID and version; opponent selections never appear here.
router.get("/sessions/:id/invitation", async (req, res, next) => {
  try {
    if (!(await draftSettings()).enabled)
      throw new DraftError("DRAFT_DISABLED", "드래프트 모드가 OFF입니다.", 503);
    const { draftSessionsTable } = await import("@workspace/db");
    const [r] = await db
      .select()
      .from(draftSessionsTable)
      .where(eq(draftSessionsTable.id, String(req.params.id)));
    if (!r || (r.state as { phase?: string }).phase !== "WAITING")
      throw new DraftError("NOT_FOUND", "대기 중인 방이 없습니다.", 404);
    res.json({ id: r.id, version: r.version });
  } catch (e) {
    next(e);
  }
});
router.get("/sessions/:id/battle", async (req, res, next) => {
  try {
    res.json(
      draftBattleView(
        await mutateDraft(req.authUser!.id, String(req.params.id)),
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.get("/sessions/:id/resources", async (req, res, next) => {
  try {
    const r = await mutateDraft(req.authUser!.id, String(req.params.id));
    if (r.state.phase !== "BATTLE" && r.state.phase !== "FINISHED")
      throw new DraftError("INVALID_PHASE", "전투 시작 후 이용할 수 있습니다.");
    res.json({
      cards: r.snapshot.cards,
      champions: r.snapshot.champions,
      media: r.snapshot.media,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/sessions/:id/rewards", async (req, res, next) => {
  try {
    res.json(await draftRewards(req.authUser!.id, String(req.params.id)));
  } catch (e) {
    next(e);
  }
});
router.post("/sessions/:id/actions", async (req, res, next) => {
  try {
    const r = await mutateDraft(req.authUser!.id, String(req.params.id), {
      version: req.body.expectedVersion,
      requestId: req.body.requestId,
      type: "ACTION",
      action: req.body.action,
    });
    res.json({
      ...draftBattleView(r),
      type: "ACTION_ACCEPTED",
      requestId: req.body.requestId,
    });
  } catch (e) {
    next(e);
  }
});
router.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (error instanceof DraftError)
      res
        .status(error.status)
        .json({ code: error.code, message: error.message });
    else if (
      error instanceof Error &&
      /설정|필요|확인|목록|숫자|가중치|제한 시간|목표|개조|리롤/.test(error.message)
    )
      res.status(400).json({ code: "INVALID_CONFIG", message: error.message });
    else next(error);
  },
);
export default router;

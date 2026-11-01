import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, gameMediaTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { readHomeMenuLayout, saveHomeMenuLayout } from "../lib/home-menu-media";
import { parseHomeMenuLayout } from "@workspace/cosmetics";
const router = Router();
router.use(async (req, res, next) => {
  try {
    req.authUser = (await getAuthenticatedUser(req)) ?? undefined;
    if (req.authUser?.role !== "ADMIN") {
      res
        .status(req.authUser ? 403 : 401)
        .json({ message: "관리자 권한이 필요합니다." });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    layout: await readHomeMenuLayout(),
    images: await db
      .select()
      .from(gameMediaTable)
      .where(eq(gameMediaTable.mediaType, "HOME_MENU_ART"))
      .orderBy(desc(gameMediaTable.createdAt)),
  });
});
router.put("/", async (req, res) => {
  const layout = parseHomeMenuLayout(req.body);
  if (!layout) {
    res
      .status(400)
      .json({ message: "이미지와 PC·모바일 배치 값을 확인해 주세요." });
    return;
  }
  try {
    await saveHomeMenuLayout(layout);
    res.json({ layout });
  } catch (e) {
    res
      .status(400)
      .json({
        message:
          e instanceof Error
            ? e.message
            : "홈 메뉴 설정을 저장하지 못했습니다.",
      });
  }
});
export default router;

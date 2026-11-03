import { accountFeatureStorage } from "../lib/account-feature-storage";
import { Router } from "express";
import { db, playerJournalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser } from "../lib/auth";
import { journalSchema, mergeJournal } from "../lib/player-journal";
const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
router.post("/sync", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return;
  }
  if (req.body?.accountId !== user.id) {
    res.status(409).json({
      message: "로그인 계정이 변경됐어요. 기록을 다시 불러와 주세요.",
    });
    return;
  }
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "기록 형식을 확인해 주세요." });
    return;
  }
  if (!(await accountFeatureStorage()).journal) {
    res
      .status(503)
      .json({
        code: "FEATURE_SETUP_PENDING",
        message:
          "계정 동기화를 준비하고 있어요. 이 기기의 기록은 계속 보관됩니다.",
      });
    return;
  }
  const document = await db.transaction(async (tx) => {
    await tx
      .insert(playerJournalsTable)
      .values({ userId: user.id })
      .onConflictDoNothing();
    const [stored] = await tx
      .select()
      .from(playerJournalsTable)
      .where(eq(playerJournalsTable.userId, user.id))
      .for("update");
    const previous = journalSchema.safeParse(stored?.document);
    const merged = mergeJournal(
      previous.success
        ? previous.data
        : { wishes: [], matches: [], removedWishes: [] },
      parsed.data,
    );
    await tx
      .update(playerJournalsTable)
      .set({ document: merged, updatedAt: new Date() })
      .where(eq(playerJournalsTable.userId, user.id));
    return merged;
  });
  res.json({ document });
});
export default router;

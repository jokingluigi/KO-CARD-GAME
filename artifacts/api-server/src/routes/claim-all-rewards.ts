import { Router, type IRouter } from "express";
import {flushQuestProgress} from '../lib/quest-progress-outbox';
import { getAuthenticatedUser } from "../lib/auth";
import {
  availableAccountRewards,
  claimAllAccountRewards,
} from "../lib/claim-all-rewards";
const router: IRouter = Router();
router.use(async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "로그인 후 보상을 받을 수 있어요." });
      return;
    }
    req.authUser = user;
    await flushQuestProgress(user.id);
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/available", async (req, res) => {
  res.json(await availableAccountRewards(req.authUser!.id));
});
router.post("/claim-all", async (req, res) => {
  if (req.body?.accountId !== req.authUser!.id) {
    res
      .status(409)
      .json({
        message:
          "로그인 계정이 변경됐어요. 현재 계정의 보상을 다시 확인해 주세요.",
      });
    return;
  }
  const proofs = req.body?.tutorialProofs ?? [];
  if (
    !Array.isArray(proofs) ||
    proofs.length > 6 ||
    JSON.stringify(proofs).length > 250000
  ) {
    res.status(400).json({ message: "튜토리얼 완료 기록을 확인해 주세요." });
    return;
  }
  res.json(await claimAllAccountRewards(req.authUser!.id, proofs));
});
export default router;

import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { getAuthenticatedUser, hashPassword, isValidEmail, isValidNickname, isValidPassword, normalizeEmail } from "../lib/auth";

const router = Router();
router.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const actor = await getAuthenticatedUser(req);
    if (!actor || actor.role !== "ADMIN") {
      res.status(actor ? 403 : 401).json({ message: "관리자 권한이 필요합니다." });
      return;
    }
    req.authUser = actor;
    next();
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const email = normalizeEmail(text(req.body?.email));
  const nickname = text(req.body?.nickname).trim();
  const password = text(req.body?.password);
  if (!isValidEmail(email) || !isValidNickname(nickname) || !isValidPassword(password) || password !== req.body?.passwordConfirmation) {
    res.status(400).json({ message: "이메일, 닉네임(2~16자), 비밀번호(8~128자)와 비밀번호 확인을 확인해 주세요." });
    return;
  }
  try {
    const [user] = await db.insert(usersTable).values({
      id: randomUUID(), email, nickname, passwordHash: await hashPassword(password), role: "ADMIN",
    }).returning({ id: usersTable.id, email: usersTable.email, nickname: usersTable.nickname, role: usersTable.role });
    req.log.info({ actorId: req.authUser!.id, userId: user!.id }, "Created additional administrator");
    res.status(201).json({ user });
  } catch (error) {
    const failure = error as {code?: string; cause?: {code?: string}};
    if (failure.code === "23505" || failure.cause?.code === "23505") {
      res.status(409).json({ message: "이미 사용 중인 이메일 또는 닉네임입니다. 기존 계정은 변경하지 않았습니다." });
      return;
    }
    next(error);
  }
});
export default router;

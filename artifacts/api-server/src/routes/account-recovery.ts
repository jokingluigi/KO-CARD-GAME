import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { and, eq, gt, lt } from "drizzle-orm";
import {
  db,
  usersTable,
  sessionsTable,
  passwordResetTokensTable,
} from "@workspace/db";
import {
  clearSessionCookie,
  getAuthenticatedUser,
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  verifyPassword,
} from "../lib/auth";
const router = Router();
const attempts = new Map<string, { at: number; count: number }>();
function limited(key: string) {
  const now = Date.now();
  if (attempts.size >= 2000)
    for (const [k, v] of attempts) if (now - v.at > 900000) attempts.delete(k);
  let item = attempts.get(key);
  if (!item || now - item.at > 900000) {
    if (attempts.size >= 2000) return true;
    attempts.set(key, (item = { at: now, count: 0 }));
  }
  return ++item.count > 5;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const configured = () => {
  try {
    const url = new URL(process.env["PUBLIC_APP_URL"] ?? "");
    return Boolean(
      process.env["RESEND_API_KEY"] &&
      process.env["PASSWORD_RESET_FROM"] &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (process.env["NODE_ENV"] !== "production" && url.protocol === "http:")),
    );
  } catch {
    return false;
  }
};
router.get("/recovery-options", (_req, res) => {
  res.json({ emailRecovery: configured() });
});
router.post("/password/forgot", async (req, res) => {
  if (limited("forgot:" + req.ip)) {
    res
      .status(429)
      .json({ message: "요청이 많아요. 15분 후 다시 시도해 주세요." });
    return;
  }
  const email = normalizeEmail(
    typeof req.body?.email === "string" ? req.body.email : "",
  );
  if (!isValidEmail(email)) {
    res.status(400).json({ message: "이메일을 확인해 주세요." });
    return;
  }
  if (!configured()) {
    res
      .status(503)
      .json({
        message:
          "이메일 복구 서비스 준비 중입니다. 로그인할 수 있다면 계정 설정에서 비밀번호를 변경할 수 있어요.",
      });
    return;
  }
  const generic = {
    message:
      "가입된 이메일이라면 비밀번호 재설정 링크를 보냈어요. 메일함과 스팸함을 확인하세요.",
  };
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (user) {
    const token = randomBytes(32).toString("hex");
    const base = new URL(process.env["PUBLIC_APP_URL"]!);
    if (
      base.protocol !== "https:" &&
      process.env["NODE_ENV"] === "production"
    ) {
      res
        .status(503)
        .json({ message: "이메일 복구 서비스를 사용할 수 없습니다." });
      return;
    }
    const resetUrl = new URL(
      "account-recovery",
      base.href.endsWith("/") ? base.href : base.href + "/",
    );
    resetUrl.hash = new URLSearchParams({ token }).toString();
    await db.transaction(async (tx) => {
      await tx
        .delete(passwordResetTokensTable)
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            lt(passwordResetTokensTable.expiresAt, new Date()),
          ),
        );
      await tx
        .insert(passwordResetTokensTable)
        .values({
          tokenHash: digest(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 1800000),
        });
    });
    void (async () => {
      try {
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env["RESEND_API_KEY"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env["PASSWORD_RESET_FROM"],
            to: email,
            subject: "KO CARD GAME 비밀번호 재설정",
            text: `30분 안에 아래 주소에서 비밀번호를 변경하세요. 요청하지 않았다면 이 메일을 무시하세요.\n${resetUrl.href}`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) throw Error("delivery");
      } catch {
        await db
          .delete(passwordResetTokensTable)
          .where(eq(passwordResetTokensTable.tokenHash, digest(token)));
        req.log.error(
          { code: "RESET_EMAIL_DELIVERY" },
          "Password recovery delivery failed",
        );
      }
    })().catch(() =>
      req.log.error(
        { code: "RESET_EMAIL_CLEANUP" },
        "Password recovery cleanup failed",
      ),
    );
  }
  res.json(generic);
});
router.post("/password/reset", async (req, res) => {
  if (limited("reset:" + req.ip)) {
    res
      .status(429)
      .json({ message: "요청이 많아요. 15분 후 다시 시도해 주세요." });
    return;
  }
  const { token, password, passwordConfirmation } = req.body ?? {};
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    typeof password !== "string" ||
    !isValidPassword(password) ||
    password !== passwordConfirmation
  ) {
    res
      .status(400)
      .json({
        message: "링크와 새 비밀번호(8~128자), 비밀번호 확인을 확인해 주세요.",
      });
    return;
  }
  const hash = await hashPassword(password);
  const updated = await db.transaction(async (tx) => {
    const [reset] = await tx
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, digest(token)),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      );
    if (!reset) return false;
    // Lock user too: two different valid links must not race to reset this account.
    await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, reset.userId))
      .for("update");
    const [stillValid] = await tx
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, digest(token)),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      )
      .for("update");
    if (!stillValid) return false;
    await tx
      .update(usersTable)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(usersTable.id, reset.userId));
    await tx
      .delete(sessionsTable)
      .where(eq(sessionsTable.userId, reset.userId));
    await tx
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, reset.userId));
    return true;
  });
  if (!updated) {
    res
      .status(400)
      .json({
        message:
          "만료되었거나 이미 사용한 링크예요. 재설정 메일을 다시 요청하세요.",
      });
    return;
  }
  clearSessionCookie(res);
  res.json({
    message: "비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.",
  });
});
router.post("/password/change", async (req, res) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return;
  }
  if (limited("change:" + user.id)) {
    res
      .status(429)
      .json({ message: "요청이 많아요. 15분 후 다시 시도해 주세요." });
    return;
  }
  const { currentPassword, password, passwordConfirmation } = req.body ?? {};
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length > 128 ||
    typeof password !== "string" ||
    !isValidPassword(password) ||
    password !== passwordConfirmation
  ) {
    res
      .status(400)
      .json({
        message: "현재 비밀번호와 새 비밀번호(8~128자), 확인을 입력하세요.",
      });
    return;
  }
  const hash = await hashPassword(password);
  const ok = await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .for("update");
    if (
      !record ||
      !(await verifyPassword(currentPassword, record.passwordHash))
    )
      return false;
    await tx
      .update(usersTable)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
    await tx
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
    return true;
  });
  if (!ok) {
    res.status(400).json({ message: "현재 비밀번호를 확인해 주세요." });
    return;
  }
  clearSessionCookie(res);
  res.json({
    message:
      "비밀번호를 변경했어요. 모든 기기에서 로그아웃됐어요. 다시 로그인해 주세요.",
  });
});
export default router;

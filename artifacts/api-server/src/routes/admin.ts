import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const ADMIN_SESSION_COOKIE = "ko_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

type AdminSessionPayload = {
  subject: "admin";
  expiresAt: number;
};

function configuredSecret(): string | null {
  return process.env["SESSION_SECRET"] ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(): string | null {
  const secret = configuredSecret();
  if (!secret) {
    return null;
  }

  const payload: AdminSessionPayload = {
    subject: "admin",
    expiresAt: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function cookieValue(request: Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));

  return cookie?.slice(`${ADMIN_SESSION_COOKIE}=`.length) ?? null;
}

function isValidSession(request: Request): boolean {
  const secret = configuredSecret();
  const token = cookieValue(request);
  if (!secret || !token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    return (
      payload.subject === "admin" &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function setSessionCookie(response: Response, token: string): void {
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL_SECONDS}${secure}`,
  );
}

function clearSessionCookie(response: Response): void {
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

function requireAdmin(request: Request, response: Response): boolean {
  if (isValidSession(request)) {
    return true;
  }

  response.status(401).json({ message: "관리자 인증이 필요합니다." });
  return false;
}

router.post("/login", (request, response) => {
  const configuredUsername = process.env["ADMIN_USERNAME"] ?? "admin";
  const configuredPassword = process.env["ADMIN_PASSWORD"];
  const { username, password } = request.body as {
    username?: unknown;
    password?: unknown;
  };

  if (
    !configuredPassword ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    !safeEqual(username, configuredUsername) ||
    !safeEqual(password, configuredPassword)
  ) {
    response.status(401).json({ message: "관리자 계정 정보가 올바르지 않습니다." });
    return;
  }

  const token = createSessionToken();
  if (!token) {
    response
      .status(503)
      .json({ message: "관리자 인증 서버 설정이 완료되지 않았습니다." });
    return;
  }

  setSessionCookie(response, token);
  response.json({ authenticated: true });
});

router.get("/session", (request, response) => {
  if (!isValidSession(request)) {
    response.status(401).json({ authenticated: false });
    return;
  }

  response.json({ authenticated: true });
});

router.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  response.json({ authenticated: false });
});

router.get("/", (request, response) => {
  if (!requireAdmin(request, response)) {
    return;
  }

  response.json({
    authenticated: true,
    modules: [{ id: "cards", label: "카드 관리", available: true }],
  });
});

export default router;
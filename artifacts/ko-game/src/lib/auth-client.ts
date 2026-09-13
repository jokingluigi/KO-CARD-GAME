export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  role: "USER" | "ADMIN";
  currency: number;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AuthUser | null;
};

const authApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth`;

async function readResponseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchCurrentUser(): Promise<AuthResponse> {
  const response = await fetch(`${authApiBase}/me`, { credentials: "include" });
  if (!response.ok) throw new Error("인증 상태를 확인하지 못했습니다.");
  return (await response.json()) as AuthResponse;
}

export async function logout(): Promise<void> {
  await fetch(`${authApiBase}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function submitAuth(
  mode: "login" | "register",
  values: Record<string, string>,
): Promise<AuthUser> {
  const response = await fetch(`${authApiBase}/${mode}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    throw new Error(await readResponseMessage(response, "요청을 처리하지 못했습니다."));
  }
  const body = (await response.json()) as AuthResponse;
  if (!body.authenticated || !body.user) {
    throw new Error("로그인 상태를 확인하지 못했습니다.");
  }
  return body.user;
}
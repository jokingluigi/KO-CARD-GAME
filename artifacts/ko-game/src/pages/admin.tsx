import { FormEvent, useEffect, useState } from "react";
import { LockKeyhole, LogOut, ShieldCheck, Spade } from "lucide-react";
import { AdminCardManager } from "@/components/admin-card-manager";

type AdminStatus = "checking" | "login" | "authenticated";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

export default function Admin() {
  const [status, setStatus] = useState<AdminStatus>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`${adminApiBase}/session`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json()) as { authenticated?: boolean };
        if (!cancelled) {
          setStatus(response.ok && body.authenticated ? "authenticated" : "login");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("login");
          setErrorMessage("관리자 서버에 연결할 수 없습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${adminApiBase}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setErrorMessage(await readMessage(response));
        return;
      }

      setPassword("");
      setStatus("authenticated");
    } catch {
      setErrorMessage("관리자 서버에 연결할 수 없습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch(`${adminApiBase}/logout`, {
      method: "POST",
      credentials: "include",
    });
    setStatus("login");
    setUsername("");
    setPassword("");
    setErrorMessage("");
  }

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        관리자 세션 확인 중...
      </main>
    );
  }

  if (status === "login") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1a1a24_0%,_#050505_58%)] px-4 text-neutral-100">
        <section className="w-full max-w-md rounded-xl border border-neutral-800 bg-black/80 p-6 shadow-2xl backdrop-blur-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-xs font-bold tracking-[0.25em] text-primary">
                DEVELOPER CONSOLE
              </div>
              <h1 className="text-2xl font-black tracking-tight">KO ADMIN</h1>
            </div>
          </div>

          <div className="mb-5 border-b border-neutral-800 pb-4">
            <p className="text-sm font-bold text-neutral-200">관리자 로그인</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              개발자 전용 페이지입니다. 서버에서 관리자 권한을 확인합니다.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-neutral-400">관리자 계정</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-neutral-400">비밀번호</span>
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-primary"
              />
            </label>
            {errorMessage && (
              <p role="alert" className="rounded border border-red-900 bg-red-950/60 px-3 py-2 text-xs font-bold text-red-300">
                {errorMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              <LockKeyhole className="h-4 w-4" />
              {isSubmitting ? "확인 중..." : "관리자 로그인"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-black/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <div className="font-display text-xs font-bold tracking-[0.25em] text-primary">
              DEVELOPER CONSOLE
            </div>
            <h1 className="text-2xl font-black">KO ADMIN</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-300 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-5 py-8">
        <nav className="w-52 shrink-0">
          <div className="mb-3 text-[10px] font-bold tracking-[0.2em] text-neutral-600">
            ADMIN MENU
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded border border-primary/60 bg-primary/10 px-3 py-3 text-left text-sm font-black text-primary"
          >
            <Spade className="h-4 w-4" />
            카드 관리
          </button>
        </nav>

        <section className="min-w-0 flex-1">
          <AdminCardManager onUnauthorized={() => setStatus("login")} />
        </section>
      </div>
    </main>
  );
}
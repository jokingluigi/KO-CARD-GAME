import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, RefreshCw, UserRound } from "lucide-react";
import { submitAuth, type AuthUser } from "@/lib/auth-client";

export function AuthLoading() {
  return (
    <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-white">
      <div className="ko-auth-loading text-center">
        <p className="font-display text-xs font-bold tracking-[0.45em] text-amber-400">KO</p>
        <p className="mt-4 text-xs font-bold tracking-[0.2em] text-neutral-500">인증 상태 확인 중</p>
      </div>
    </main>
  );
}

export function AuthRecovery({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-white">
      <section className="ko-auth-card w-full max-w-[380px] text-center">
        <p className="font-display text-xs font-bold tracking-[0.45em] text-amber-400">KO</p>
        <h1 className="mt-5 text-xl font-black">인증 서버에 연결할 수 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-500">
          {message ?? "잠시 후 다시 시도해 주세요."}
        </p>
        <button type="button" onClick={onRetry} className="ko-auth-submit mt-7">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          다시 시도
        </button>
      </section>
    </main>
  );
}

export function AuthPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setErrorMessage("");
    setPassword("");
    setPasswordConfirmation("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const user = await submitAuth(mode, {
        email,
        ...(mode === "register" ? { nickname, passwordConfirmation } : {}),
        password,
      });
      onAuthenticated(user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 py-10 text-white">
      <section className="ko-auth-card w-full max-w-[380px]">
        <header className="mb-9 text-center">
          <h1 className="ko-main-menu__logo font-display font-black text-white">KO</h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">CARD BATTLE</p>
        </header>

        <div className="mb-7 flex border-b border-neutral-800">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`ko-auth-tab ${mode === "login" ? "ko-auth-tab--active" : ""}`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`ko-auth-tab ${mode === "register" ? "ko-auth-tab--active" : ""}`}
          >
            회원가입
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="ko-auth-field">
            <span>이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          {mode === "register" && (
            <label className="ko-auth-field">
              <span>닉네임</span>
              <input
                required
                minLength={2}
                maxLength={16}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
                placeholder="2~16자"
              />
            </label>
          )}

          <label className="ko-auth-field">
            <span>비밀번호</span>
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="8자 이상"
            />
          </label>

          {mode === "register" && (
            <label className="ko-auth-field">
              <span>비밀번호 확인</span>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}

          {errorMessage && (
            <p role="alert" className="ko-auth-error">
              {errorMessage}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="ko-auth-submit">
            {isSubmitting ? "확인 중..." : mode === "login" ? "로그인" : "계정 만들기"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </form>

        <p className="mt-7 flex items-center justify-center gap-2 text-xs text-neutral-500">
          {mode === "login" ? (
            <>
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              계정이 없나요?
              <button type="button" onClick={() => switchMode("register")} className="font-bold text-amber-400 hover:text-amber-300">
                회원가입
              </button>
            </>
          ) : (
            <>
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              이미 계정이 있나요?
              <button type="button" onClick={() => switchMode("login")} className="font-bold text-amber-400 hover:text-amber-300">
                로그인
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
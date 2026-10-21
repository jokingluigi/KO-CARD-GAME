import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { submitAuth, type AuthUser } from "@/lib/auth-client";

export function AuthLoading() {
  return (
    <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-white">
      <div className="ko-auth-loading text-center">
        <p className="font-display text-xs font-bold tracking-[0.45em] text-amber-400">
          KO
        </p>
        <p className="mt-4 text-xs font-bold tracking-[0.2em] text-neutral-500">
          CARD BATTLE
        </p>
      </div>
    </main>
  );
}

export function AuthRecovery({
  onRetry,
  onAuthenticated,
}: {
  message?: string;
  onRetry: () => void;
  onAuthenticated?: (user: AuthUser) => void;
}) {
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        retryRef.current();
        timer = setTimeout(retry, 5_000);
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(retry, 2_000);
    };
    if (document.visibilityState === "visible")
      timer = setTimeout(retry, 5_000);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <AuthPage
      recoveryMessage="서버 응답을 기다리고 있어. 기존 로그인은 자동으로 다시 확인하고, 아래에서 직접 로그인할 수도 있어."
      onRetry={onRetry}
      onAuthenticated={(user) => onAuthenticated ? onAuthenticated(user) : retryRef.current()}
    />
  );
}

export function AuthPage({
  onAuthenticated,
  loginOnly = false,
  recoveryMessage,
  onRetry,
}: {
  onAuthenticated: (user: AuthUser) => void;
  loginOnly?: boolean;
  recoveryMessage?: string | null;
  onRetry?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const submission = useRef<AbortController | null>(null);
  useEffect(() => () => submission.current?.abort(), []);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setErrorMessage("");
    setPassword("");
    setPasswordConfirmation("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current) return;
    const controller = new AbortController();
    submission.current = controller;
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const user = await submitAuth(
        loginOnly ? "login" : mode,
        {
          email,
          ...(mode === "register" ? { nickname, passwordConfirmation } : {}),
          password,
        },
        {
          signal: controller.signal,
          onStage: (stage) => setConnecting(stage === "connecting"),
        },
      );
      if (!controller.signal.aborted) onAuthenticated(user);
    } catch (error) {
      if (!controller.signal.aborted)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "요청을 처리하지 못했습니다.",
        );
    } finally {
      if (submission.current === controller) submission.current = null;
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
        setConnecting(false);
      }
    }
  }

  return (
    <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 py-10 text-white">
      <section className="ko-auth-card w-full max-w-[380px]">
        <header className="mb-9 text-center">
          <h1 className="ko-main-menu__logo font-display font-black text-white">
            KO
          </h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">
            CARD BATTLE
          </p>
        </header>

        <div className="mb-7 flex border-b border-neutral-800">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => switchMode("login")}
            className={`ko-auth-tab ${mode === "login" ? "ko-auth-tab--active" : ""}`}
          >
            로그인
          </button>
          {!loginOnly && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => switchMode("register")}
              className={`ko-auth-tab ${mode === "register" ? "ko-auth-tab--active" : ""}`}
            >
              회원가입
            </button>
          )}
        </div>

        {loginOnly && (
          <p className="mb-4 text-sm text-amber-300">
            서버 점검 중에는 관리자 계정만 로그인할 수 있습니다.
          </p>
        )}
        {recoveryMessage && (
          <div role="status" className="mb-4 text-sm text-neutral-400">
            <p>{recoveryMessage}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-amber-400"
              >
                다시 확인
              </button>
            )}
          </div>
        )}
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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
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
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
                autoComplete="new-password"
              />
            </label>
          )}

          {errorMessage && (
            <p role="alert" className="ko-auth-error">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="ko-auth-submit"
          >
            {isSubmitting
              ? connecting
                ? "서버 연결 중..."
                : "확인 중..."
              : mode === "login"
                ? "로그인"
                : "계정 만들기"}
            {!isSubmitting && (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </form>

        <p className="mt-7 flex items-center justify-center gap-2 text-xs text-neutral-500">
          {mode === "login" ? (
            <>
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              계정이 없나요?
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => switchMode("register")}
                className="font-bold text-amber-400 hover:text-amber-300"
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              이미 계정이 있나요?
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => switchMode("login")}
                className="font-bold text-amber-400 hover:text-amber-300"
              >
                로그인
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
}

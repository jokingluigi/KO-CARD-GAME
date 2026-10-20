import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AuthPage, AuthLoading } from "./auth-page";
import {
  AuthRequestError,
  fetchCurrentUser,
  type AuthUser,
} from "@/lib/auth-client";
const Home = lazy(() => import("@/pages/home"));
export default function HomeEntry() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [checking, setChecking] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setChecking(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revealForm = setTimeout(() => setShowForm(true), 1200);
    async function restore() {
      try {
        const result = await fetchCurrentUser();
        if (current !== generation.current) return;
        if (result.authenticated && result.user) setUser(result.user);
        setError(null);
      } catch (failure) {
        if (current !== generation.current) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "로그인 상태를 확인하지 못했습니다.",
        );
        if (
          failure instanceof AuthRequestError &&
          (failure.status === undefined || failure.status >= 500)
        )
          timer = setTimeout(() => void restore(), 2000);
      } finally {
        clearTimeout(revealForm);
        if (current === generation.current) setChecking(false);
      }
    }
    void restore();
    return () => {
      generation.current++;
      clearTimeout(timer);
      clearTimeout(revealForm);
    };
  }, [retry]);
  if (user)
    return (
      <Suspense fallback={<AuthLoading />}>
        <Home initialAuthUser={user} />
      </Suspense>
    );
  if (checking && !showForm) return <AuthLoading />;
  return (
    <AuthPage
      recoveryMessage={
        checking
          ? "서버에 연결하고 있어. 로그인 정보를 미리 입력해도 돼."
          : error
      }
      onRetry={() => setRetry((value) => value + 1)}
      onAuthenticated={(next) => {
        generation.current++;
        setError(null);
        setUser(next);
      }}
    />
  );
}

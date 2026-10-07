import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AuthPage, AuthLoading } from './auth-page';
import { AuthRequestError, fetchCurrentUser, type AuthUser } from '@/lib/auth-client';
const Home = lazy(() => import('@/pages/home'));
export default function HomeEntry() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function restore() {
      try {
        const result = await fetchCurrentUser();
        if (current !== generation.current) return;
        if (result.authenticated && result.user) setUser(result.user);
        setError(null);
      } catch (failure) {
        if (current !== generation.current) return;
        setError(failure instanceof Error ? failure.message : '로그인 상태를 확인하지 못했습니다.');
        if (failure instanceof AuthRequestError && (failure.status === undefined || failure.status >= 500))
          timer = setTimeout(() => void restore(), 2000);
      }
    }
    void restore();
    return () => { generation.current++; clearTimeout(timer); };
  }, [retry]);
  if (user) return <Suspense fallback={<AuthLoading />}><Home initialAuthUser={user} /></Suspense>;
  return <AuthPage recoveryMessage={error} onRetry={() => setRetry(value => value + 1)} onAuthenticated={next => {
    generation.current++;
    setError(null);
    setUser(next);
  }} />;
}

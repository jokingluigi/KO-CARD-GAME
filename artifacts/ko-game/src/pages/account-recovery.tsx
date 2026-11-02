import {clearLocalSession} from '@/lib/auth-client';
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { GamePageHeader } from "@/components/game-page-header";
const api = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api/auth";
export default function AccountRecovery() {
  const token = useRef(
    new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (token.current) history.replaceState(null, "", window.location.pathname);
    return () => pending.current?.abort();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    setError("");
    setMessage("");
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    try {
      const r = await fetch(
        api + (token.current ? "/password/reset" : "/password/forgot"),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
          body: JSON.stringify(
            token.current
              ? {
                  token: token.current,
                  password,
                  passwordConfirmation: confirmation,
                }
              : { email },
          ),
        },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.message ?? "요청을 처리하지 못했어요.");
      setMessage(data.message);
      if (token.current) {
        clearLocalSession();
        setDone(true);
        setPassword("");
        setConfirmation("");
      }
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        );
    } finally {
      if (pending.current === c) pending.current = null;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <main className="ko-player-page ko-account-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="계정 복구"
          title="비밀번호 재설정"
          description="계정에 등록한 이메일로 본인 확인 후 변경합니다."
        />
        <form onSubmit={submit} className="ko-account-form">
          {!done &&
            (token.current ? (
              <>
                <label>
                  새 비밀번호
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  새 비밀번호 확인
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                가입한 이메일
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ))}
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {!done && (
            <button disabled={busy} className="ko-surface-action">
              {busy
                ? "처리 중…"
                : token.current
                  ? "새 비밀번호 저장"
                  : "재설정 메일 요청"}
            </button>
          )}
          <Link href="/" className="ko-surface-back">
            로그인으로 돌아가기
          </Link>
        </form>
      </div>
    </main>
  );
}

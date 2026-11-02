import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CombatSettings } from "@/components/combat-settings";
import { SfxVolumeControl } from "@/components/sfx-volume-control";
import { GamePageHeader } from "@/components/game-page-header";
import { fetchCurrentUser, clearLocalSession, type AuthUser } from "@/lib/auth-client";
import { audioManager } from "@/audio/audio-manager";
import {
  BGM_VOLUME_STORAGE_KEY,
  readStoredBgmVolume,
} from "@/audio/audio-settings";
export default function Settings() {
  const [tab, setTab] = useState("display"),
    [user, setUser] = useState<AuthUser | null>(null),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [volume, setVolume] = useState(readStoredBgmVolume);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((r) => {
        if (active) setUser(r.user);
      })
      .catch(() => {
        if (active)
          setError("로그인 상태를 확인하지 못했어요. 다시 접속해 주세요.");
      });
    return () => {
      active = false;
      request.current?.abort();
    };
  }, []);
  async function change(e: FormEvent) {
    e.preventDefault();
    if (request.current) return;
    setError("");
    setStatus("");
    if (password !== confirmation) {
      setError("새 비밀번호 확인이 일치하지 않아요.");
      return;
    }
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    try {
      const r = await fetch(
        (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") +
          "/api/auth/password/change",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
          body: JSON.stringify({
            currentPassword: current,
            password,
            passwordConfirmation: confirmation,
          }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.message);
      setCurrent("");
      setPassword("");
      setConfirmation("");
      clearLocalSession();
      setUser(null);
      setStatus(data.message);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "변경하지 못했어요.");
    } finally {
      request.current = null;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <main className="ko-player-page ko-account-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="게임 설정"
          title="설정"
          description="화면·소리·계정을 한곳에서 조절하세요."
        />
        <nav className="ko-surface-tabs" aria-label="설정 분류">
          {[
            ["display", "화면 · 접근성"],
            ["sound", "소리"],
            ["account", "계정"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "display" && (
          <section className="ko-settings-panel">
            <p className="ko-surface-message">
              이 기기에 저장돼요. 전투 중에도 설정에서 조절할 수 있어요.
            </p>
            <CombatSettings />
          </section>
        )}
        {tab === "sound" && (
          <section className="ko-settings-panel">
            <label>
              배경음 {volume}%
              <input
                type="range"
                aria-label="배경음 볼륨"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setVolume(n);
                  audioManager.setBgmVolume(n);
                  try {
                    localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(n));
                  } catch {}
                }}
              />
            </label>
            <SfxVolumeControl />
          </section>
        )}
        {tab === "account" && (
          <section className="ko-settings-panel">
            <h2>비밀번호 변경</h2>
            <p className="ko-surface-message">
              변경 후 모든 기기에서 로그아웃됩니다.
            </p>
            {user ? (
              <form className="ko-account-form" onSubmit={change}>
                <label>
                  현재 비밀번호
                  <input
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </label>
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
                <button disabled={busy} className="ko-surface-action">
                  {busy ? "변경 중…" : "비밀번호 변경"}
                </button>
              </form>
            ) : (
              <Link href="/">로그인으로 이동</Link>
            )}
            <Link href="/account-recovery" className="ko-surface-back">
              비밀번호를 잊었나요?
            </Link>
          </section>
        )}
        {error && (
          <p className="ko-surface-message is-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="ko-surface-message" role="status">
            {status}
          </p>
        )}
      </div>
    </main>
  );
}

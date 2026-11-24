import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./admin-kit.css";

/**
 * 관리 화면 공통 틀 — every admin screen uses the same pieces so they look and behave the same:
 * a list on the left (on a phone: the list first, then the editor with a "← 목록" button),
 * an editor on the right, plain Korean labels, and one save-status line at the top of the editor.
 */

export const adminApi = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) { super(message); }
}

/** fetch + JSON + a Korean error message. 401/403 call onUnauthorized. */
export async function adminFetch<T = unknown>(path: string, init?: RequestInit & { json?: unknown }, onUnauthorized?: () => void): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path.startsWith("http") || path.startsWith("/api") ? path : adminApi + path, {
    ...rest,
    credentials: "include",
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (response.status === 401) onUnauthorized?.();
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const extra = Array.isArray(body.validationErrors) ? body.validationErrors : Array.isArray(body.referenceErrors) ? body.referenceErrors : Array.isArray(body.errors) ? body.errors : [];
    const message = [typeof body.message === "string" ? body.message : "요청을 처리하지 못했어요.", ...extra.map(String)].join(" ");
    throw new AdminApiError(message, response.status, body);
  }
  return body as T;
}

export function errorText(error: unknown, fallback = "처리하지 못했어요.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type SaveState = { kind: "idle" | "dirty" | "saving" | "saved" | "error"; message?: string };

export function SaveLine({ state, idle = "고치면 바로 저장돼요" }: { state: SaveState; idle?: string }) {
  const text = state.kind === "saving" ? state.message ?? "저장 중…"
    : state.kind === "saved" ? `✓ ${state.message ?? "저장됨"}`
    : state.kind === "error" ? `⚠ ${state.message ?? "저장하지 못했어요"}`
    : state.kind === "dirty" ? state.message ?? "입력 중…"
    : state.message ?? idle;
  return <div className="ak-save" data-kind={state.kind} role="status" aria-live="polite">{text}</div>;
}

/**
 * Saves `value` by itself a moment after the last change. `key` identifies the record (changing it
 * resets without saving). Returns the save state plus `flush()` to save right away.
 */
export function useAutosave<T>(key: string | null, value: T | null, save: (value: T) => Promise<string | void>, delay = 900) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const last = useRef<string | null>(null);
  const lastKey = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<T | null>(null);
  const serialized = value === null ? null : JSON.stringify(value);

  const run = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const next = pending.current;
    if (next === null) return;
    pending.current = null;
    const snapshot = JSON.stringify(next);
    setState({ kind: "saving" });
    try {
      const label = await saveRef.current(next);
      last.current = snapshot;
      setState({ kind: "saved", message: label || "저장됨" });
    } catch (error) {
      setState({ kind: "error", message: errorText(error, "저장하지 못했어요. 값을 확인해 주세요.") });
    }
  }, []);

  useEffect(() => {
    if (key !== lastKey.current) {
      if (timer.current) void run();
      lastKey.current = key; last.current = serialized; pending.current = null;
      setState({ kind: "idle" });
      return;
    }
    if (serialized === null || serialized === last.current) return;
    if (last.current === null) { last.current = serialized; return; } // first load is the baseline
    pending.current = value;
    setState({ kind: "dirty" });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), delay);
  }, [key, serialized]);

  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void run(); } }, [run]);
  return { state, setState, flush: run, markSaved: (v: T) => { last.current = JSON.stringify(v); } };
}

export function Split({ list, editor, editing, className }: { list: ReactNode; editor: ReactNode; editing: boolean; className?: string }) {
  return <div className={`ak-split ${className ?? ""}`} data-editing={editing || undefined}>{list}{editor}</div>;
}

export function ListPane({ children, actions, search, onSearch, placeholder = "이름으로 찾기", filters, count }: {
  children: ReactNode; actions?: ReactNode; search?: string; onSearch?: (value: string) => void; placeholder?: string; filters?: ReactNode; count?: string;
}) {
  return (
    <aside className="ak-list">
      {actions && <div className="ak-list-actions">{actions}</div>}
      {onSearch && <input className="ak-search" value={search ?? ""} placeholder={placeholder} onChange={(e) => onSearch(e.target.value)} />}
      {filters && <div className="ak-chips">{filters}</div>}
      {count && <p className="ak-count">{count}</p>}
      <ul>{children}</ul>
    </aside>
  );
}

export function ListRow({ selected, onClick, title, sub, badge, tone, thumb }: {
  selected?: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; badge?: ReactNode; tone?: "on" | "off" | "warn" | "danger"; thumb?: string | null;
}) {
  return (
    <li>
      <button type="button" aria-current={selected || undefined} onClick={onClick}>
        {thumb !== undefined && <span className="ak-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />}
        <span className="ak-row-main"><b>{title}</b>{sub && <small>{sub}</small>}</span>
        {badge && <span className="ak-badge" data-tone={tone}>{badge}</span>}
      </button>
    </li>
  );
}

export function EditorPane({ children, onBack, status, right, empty }: { children?: ReactNode; onBack?: () => void; status?: ReactNode; right?: ReactNode; empty?: ReactNode }) {
  return (
    <section className="ak-edit">
      {children ? <>
        <header className="ak-head">
          {onBack && <button type="button" className="ak-back" onClick={onBack}>← 목록</button>}
          <div className="ak-head-status">{status}</div>
          {right && <div className="ak-head-right">{right}</div>}
        </header>
        <div className="ak-body">{children}</div>
      </> : <div className="ak-empty">{empty ?? "왼쪽 목록에서 고르거나 새로 만들어 보세요."}</div>}
    </section>
  );
}

export function Panel({ title, hint, children, right }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="ak-panel">
      {(title || right) && <header><h3>{title}</h3>{right}</header>}
      {hint && <p className="ak-hint">{hint}</p>}
      <div className="ak-panel-body">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <label className="ak-field" data-wide={wide || undefined}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className="ak-grid" data-cols={cols}>{children}</div>;
}

export function NumberInput({ value, onChange, min = 0, max = 1_000_000, step = 1, suffix }: { value: number | null | undefined; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const n = Number(value ?? 0);
  const set = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next / step) * step)));
  return (
    <div className="ak-number">
      <button type="button" aria-label="줄이기" onClick={() => set(n - step)}>−</button>
      <input inputMode="numeric" value={value === null || value === undefined ? "" : String(value)} onChange={(e) => { const raw = e.target.value.replace(/[^\d-]/g, ""); set(raw === "" || raw === "-" ? min : Number(raw)); }} />
      {suffix && <em>{suffix}</em>}
      <button type="button" aria-label="늘리기" onClick={() => set(n + step)}>+</button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" className="ak-toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <i aria-hidden="true" /><span>{label}{hint && <small>{hint}</small>}</span>
    </button>
  );
}

export function Chip({ on, onClick, children, tone }: { on?: boolean; onClick: () => void; children: ReactNode; tone?: "danger" }) {
  return <button type="button" className="ak-chip" aria-pressed={on ?? undefined} data-tone={tone} onClick={onClick}>{children}</button>;
}

export function Button({ children, onClick, kind = "default", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "default" | "danger" | "ghost"; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className="ak-btn" data-kind={kind} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode }) {
  return <div className="ak-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (value: T) => void; tabs: readonly (readonly [T, ReactNode])[] }) {
  return (
    <div className="ak-tabs" role="tablist">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

/** Picks an image file and uploads it through the shared card-image storage; returns the asset. */
export async function uploadAdminImage(file: File, onUnauthorized?: () => void) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("PNG, JPG, WEBP 그림만 올릴 수 있어요.");
  if (file.size > 5 * 1024 * 1024) throw new Error("5MB보다 작은 그림만 올릴 수 있어요.");
  const ask = await adminFetch<{ uploadURL: string; objectPath: string }>("/cards/images/upload-url", { method: "POST", json: { name: file.name, size: file.size, contentType: file.type } }, onUnauthorized);
  const put = await fetch(ask.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("그림을 올리지 못했어요.");
  return adminFetch<{ imageAssetId: string; imageUrl: string; imageUploadToken: string }>("/cards/images/complete", { method: "POST", json: { objectPath: ask.objectPath, contentType: file.type } }, onUnauthorized);
}

export function ImagePick({ label = "그림 올리기", onFile, busy }: { label?: string; onFile: (file: File) => void; busy?: boolean }) {
  return (
    <label className="ak-image-pick" data-busy={busy || undefined}>
      {busy ? "올리는 중…" : label}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

export function useMobileEditing() {
  const [editing, setEditing] = useState(false);
  return { editing, open: () => setEditing(true), back: () => setEditing(false) };
}

/** Local datetime-local value ⇄ ISO string. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string) {
  if (!value) return null;
  const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const STATUS_KO: Record<string, string> = { PUBLISHED: "공개", DRAFT: "미공개", DISABLED: "비활성", ARCHIVED: "보관", ACTIVE: "진행 중", SCHEDULED: "예정", ENDED: "끝남" };
export const RARITY_KO: Record<string, string> = { NORMAL: "일반", EPIC: "에픽", LEGENDARY: "레전더리", CHAMPION: "챔피언", TOKEN: "토큰" };
export function statusTone(status: string): "on" | "off" | "warn" | "danger" {
  return status === "PUBLISHED" || status === "ACTIVE" ? "on" : status === "DISABLED" ? "danger" : status === "DRAFT" || status === "SCHEDULED" ? "warn" : "off";
}

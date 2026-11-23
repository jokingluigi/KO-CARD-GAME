import { useEffect, useState, type FormEvent } from "react";
import { adminFetch, Button, errorText, Field, Grid, Notice, Panel, SaveLine, Toggle, useAutosave } from "./admin-kit";

type Maintenance = { enabled: boolean; message: string };

/** 서버 점검 · 관리자 계정 */
export function AdminSystem({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [state, setState] = useState<Maintenance | null>(null);
  const [error, setError] = useState("");
  const [account, setAccount] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminFetch<Maintenance>("/server-maintenance", undefined, onUnauthorized).then(setState).catch((e) => setError(errorText(e, "점검 설정을 불러오지 못했어요.")));
  }, []);

  const autosave = useAutosave("maintenance", state, async (next) => {
    if (!next.message.trim()) throw new Error("안내 글을 써 주세요.");
    const saved = await adminFetch<Maintenance>("/server-maintenance", { method: "PUT", json: next }, onUnauthorized);
    window.dispatchEvent(new Event("ko-admin-maintenance-changed"));
    return saved.enabled ? "점검 중으로 저장됨" : "저장됨";
  }, 700);

  function toggle(enabled: boolean) {
    if (!state) return;
    if (enabled && !window.confirm("서버 점검을 켤까요?\n게이머는 접속과 게임을 할 수 없게 돼요. (관리자는 계속 쓸 수 있어요)")) return;
    setState({ ...state, enabled });
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (fields.password !== fields.passwordConfirmation) { setAccount({ tone: "error", text: "비밀번호 두 칸이 서로 달라요." }); return; }
    setBusy(true); setAccount(null);
    try {
      const result = await adminFetch<{ user: { nickname: string } }>("/accounts", { method: "POST", json: fields }, onUnauthorized);
      form.reset();
      setAccount({ tone: "ok", text: `${result.user.nickname} 관리자 계정을 만들었어요. 그 이메일과 비밀번호로 로그인하면 돼요.` });
    } catch (e) { setAccount({ tone: "error", text: errorText(e, "계정을 만들지 못했어요.") }); }
    finally { setBusy(false); }
  }

  return (
    <div className="ak-page">
      <Panel title="서버 점검" right={state && <SaveLine state={autosave.state} idle="" />} hint="켜면 게이머는 접속하거나 게임할 수 없고, 아래 안내 글을 보게 돼요. 관리자는 계속 쓸 수 있어요.">
        {error && <Notice tone="error">{error}</Notice>}
        {state && <>
          <Toggle checked={state.enabled} onChange={toggle} label={state.enabled ? "점검 중 (게이머 접속 막힘)" : "정상 운영 중"} />
          {state.enabled && <Notice tone="warn">지금 게이머는 게임에 들어올 수 없어요. 점검이 끝나면 꼭 꺼 주세요.</Notice>}
          <Field label="게이머에게 보일 안내 글"><textarea rows={3} maxLength={300} value={state.message} onChange={(e) => setState({ ...state, message: e.target.value })} /></Field>
        </>}
      </Panel>

      <Panel title="새 관리자 계정" hint="새 계정도 이 관리 사이트의 모든 기능을 쓸 수 있어요. 믿을 수 있는 사람에게만 만들어 주세요.">
        <form onSubmit={createAdmin} className="ak-panel-body" autoComplete="off">
          <Grid>
            <Field label="로그인 이메일"><input name="email" type="email" required maxLength={254} autoComplete="off" /></Field>
            <Field label="닉네임" hint="2~16글자"><input name="nickname" required minLength={2} maxLength={16} autoComplete="off" /></Field>
            <Field label="비밀번호" hint="8글자 이상"><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
            <Field label="비밀번호 확인"><input name="passwordConfirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
          </Grid>
          <div><Button type="submit" kind="primary" disabled={busy}>{busy ? "만드는 중…" : "관리자 계정 만들기"}</Button></div>
          {account && <Notice tone={account.tone}>{account.text}</Notice>}
        </form>
      </Panel>
    </div>
  );
}

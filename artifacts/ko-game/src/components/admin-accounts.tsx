import { useState, type FormEvent } from "react";

export function AdminAccounts() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/admin/accounts", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields)),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || "계정을 만들지 못했습니다.");
      form.reset();
      setMessage(`${result.user.nickname} 관리자 계정을 만들었습니다. 새 이메일과 비밀번호로 게임에 로그인할 수 있습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "계정을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 rounded border border-white/15 p-4">
    <h2 className="text-lg font-bold">새 관리자 계정</h2>
    <p className="mb-4 text-sm">새 계정은 카드·챔피언 수정 등 모든 관리자 기능을 사용할 수 있습니다. 기존 계정은 유지됩니다.</p>
    <form onSubmit={create} className="grid max-w-lg gap-3">
      <label>로그인 이메일<input className="block w-full rounded border p-2" name="email" type="email" required maxLength={254} autoComplete="off" /></label>
      <label>닉네임<input className="block w-full rounded border p-2" name="nickname" required minLength={2} maxLength={16} autoComplete="off" /></label>
      <label>비밀번호<input className="block w-full rounded border p-2" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
      <label>비밀번호 확인<input className="block w-full rounded border p-2" name="passwordConfirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
      <button className="rounded bg-primary p-3 font-bold text-black" disabled={busy} type="submit">{busy ? "생성 중…" : "관리자 계정 만들기"}</button>
    </form>
    {message && <p role="status" className="mt-3">{message}</p>}
  </section>;
}

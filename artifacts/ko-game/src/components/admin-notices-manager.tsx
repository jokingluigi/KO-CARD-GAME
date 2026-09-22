import { Megaphone, Power, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";

type NoticeRecord = {
  id: string;
  title: string;
  body: string;
  displayOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  onUnauthorized: () => void;
};

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/notices`;

async function readMessage(response: Response) {
  try {
    return ((await response.json()) as { message?: string }).message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

export function AdminNoticesManager({ onUnauthorized }: Props) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadNotices();
  }, []);

  async function loadNotices() {
    setLoading(true);
    try {
      const response = await fetch(apiBase, { credentials: "include" });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      const result = await response.json() as { notices?: NoticeRecord[] };
      setNotices(result.notices ?? []);
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "공지를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function createNotice(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          displayOrder: Number(displayOrder),
          enabled,
        }),
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      setTitle("");
      setBody("");
      setDisplayOrder("0");
      setEnabled(true);
      setMessage("공지를 추가했습니다.");
      await loadNotices();
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "공지를 추가하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function updateNotice(notice: NoticeRecord) {
    setMessage("");
    setErrorMessage("");
    const response = await fetch(`${apiBase}/${encodeURIComponent(notice.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notice),
    });
    if (response.status === 401) {
      onUnauthorized();
      return;
    }
    if (!response.ok) {
      setErrorMessage(await readMessage(response));
      return;
    }
    const result = await response.json() as { notice: NoticeRecord };
    setNotices((current) => current.map((item) => item.id === notice.id ? result.notice : item));
    setMessage("공지를 저장했습니다.");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-xs font-bold tracking-[0.2em] text-primary">MAIN NOTICE</div>
        <h2 className="mt-1 text-2xl font-black">공지 관리</h2>
        <p className="mt-2 text-sm text-neutral-500">활성 공지만 일반 사용자 메인 화면에 표시됩니다. 내용은 안전한 일반 텍스트로 렌더링됩니다.</p>
      </div>

      {(message || errorMessage) && (
        <div className={`rounded border px-3 py-2 text-xs font-bold ${errorMessage ? "border-red-900 bg-red-950/50 text-red-300" : "border-emerald-900 bg-emerald-950/40 text-emerald-300"}`}>
          {errorMessage || message}
        </div>
      )}

      <form onSubmit={createNotice} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-primary">
          <Megaphone className="h-5 w-5" />
          <h3 className="text-sm font-black">새 공지</h3>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="공지 제목"
          maxLength={120}
          required
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="공지 내용"
          maxLength={4000}
          required
          rows={4}
          className="w-full resize-y rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            우선순위
            <input
              type="number"
              value={displayOrder}
              onChange={(event) => setDisplayOrder(event.target.value)}
              className="w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-300">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            바로 활성화
          </label>
          <button type="submit" disabled={saving} className="ml-auto flex items-center gap-2 rounded bg-primary px-4 py-2 text-xs font-black text-black hover:bg-yellow-400 disabled:opacity-50">
            <Send className="h-4 w-4" /> {saving ? "저장 중..." : "공지 추가"}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-black text-neutral-300">등록된 공지</h3>
        {loading ? (
          <p className="text-xs text-neutral-500">공지를 불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 px-3 py-8 text-center text-xs text-neutral-600">등록된 공지가 없습니다.</p>
        ) : notices.map((notice) => (
          <article key={notice.id} className="space-y-3 rounded-lg border border-neutral-800 bg-black/30 p-4">
            <input
              value={notice.title}
              onChange={(event) => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, title: event.target.value } : item))}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm font-black outline-none focus:border-primary"
            />
            <textarea
              value={notice.body}
              onChange={(event) => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, body: event.target.value } : item))}
              rows={3}
              className="w-full resize-y rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                우선순위
                <input
                  type="number"
                  value={notice.displayOrder}
                  onChange={(event) => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, displayOrder: Number(event.target.value) } : item))}
                  className="w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                <input
                  type="checkbox"
                  checked={notice.enabled}
                  onChange={(event) => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, enabled: event.target.checked } : item))}
                />
                <Power className="h-3.5 w-3.5" /> 활성
              </label>
              <button type="button" onClick={() => void updateNotice(notice)} className="ml-auto flex items-center gap-2 rounded border border-primary/60 px-3 py-2 text-xs font-black text-primary hover:bg-primary/10">
                <Save className="h-4 w-4" /> 저장
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
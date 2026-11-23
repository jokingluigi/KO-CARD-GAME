import { useEffect, useMemo, useState } from "react";
import { adminFetch, Button, EditorPane, errorText, Field, Grid, ListPane, ListRow, Notice, NumberInput, Panel, SaveLine, Split, Toggle, useAutosave, useMobileEditing } from "./admin-kit";

type NoticeRecord = { id: string; title: string; body: string; displayOrder: number; enabled: boolean; createdAt: string; updatedAt: string };

/** 공지사항 — 목록에서 고르면 오른쪽에서 고치고, 고치면 바로 저장돼요. */
export function AdminNoticesManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [notices, setNotices] = useState<NoticeRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoticeRecord | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const mobile = useMobileEditing();

  async function load() {
    try {
      const body = await adminFetch<{ notices?: NoticeRecord[] }>("/notices", undefined, onUnauthorized);
      setNotices(body.notices ?? []);
    } catch (e) { setError(errorText(e, "공지를 불러오지 못했어요.")); setNotices([]); }
  }
  useEffect(() => { void load(); }, []);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    if (!next.title.trim() || !next.body.trim()) throw new Error("제목과 내용을 둘 다 써 주세요.");
    const body = await adminFetch<{ notice: NoticeRecord }>(`/notices/${encodeURIComponent(next.id)}`, { method: "PATCH", json: next }, onUnauthorized);
    setNotices((list) => list?.map((n) => (n.id === next.id ? body.notice : n)) ?? list);
  });

  function select(notice: NoticeRecord) { void autosave.flush(); setSelectedId(notice.id); setDraft(notice); mobile.open(); }

  async function create() {
    try {
      const body = await adminFetch<{ notice?: NoticeRecord; notices?: NoticeRecord[] }>("/notices", { method: "POST", json: { title: "새 공지", body: "내용을 써 주세요.", displayOrder: 0, enabled: false } }, onUnauthorized);
      await load();
      const created = body.notice;
      if (created) select(created);
    } catch (e) { setError(errorText(e, "공지를 만들지 못했어요.")); }
  }

  async function remove() {
    if (!draft || !window.confirm(`"${draft.title}" 공지를 지울까요?\n게이머 화면에서도 사라지고 되돌릴 수 없어요.`)) return;
    try {
      await adminFetch(`/notices/${encodeURIComponent(draft.id)}`, { method: "DELETE" }, onUnauthorized);
      setNotices((list) => list?.filter((n) => n.id !== draft.id) ?? list);
      setDraft(null); setSelectedId(null); mobile.back();
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }

  const filtered = useMemo(() => (notices ?? [])
    .filter((n) => !search.trim() || `${n.title} ${n.body}`.includes(search.trim()))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.displayOrder - a.displayOrder || b.updatedAt.localeCompare(a.updatedAt)), [notices, search]);

  if (!notices) return <p className="text-sm text-neutral-400">공지를 불러오는 중…</p>;
  const set = (patch: Partial<NoticeRecord>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="ak-page">
      {error && <Notice tone="error">{error}</Notice>}
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 공지</button>} search={search} onSearch={setSearch} placeholder="제목이나 내용으로 찾기" count={`${filtered.length}개 · 보이는 공지 ${notices.filter((n) => n.enabled).length}개`}>
          {filtered.map((n) => <ListRow key={n.id} selected={n.id === selectedId} onClick={() => select(n)} title={n.title} sub={n.body.replace(/\s+/g, " ").slice(0, 40)} badge={n.enabled ? "보임" : "숨김"} tone={n.enabled ? "on" : "off"} />)}
          {!filtered.length && <p className="ak-hint" style={{ margin: 8 }}>공지가 없어요. "+ 새 공지"로 만들어 보세요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />} right={draft && <Button kind="danger" onClick={() => void remove()}>지우기</Button>}
          empty='왼쪽에서 공지를 고르거나 "+ 새 공지"를 눌러 보세요. 고친 내용은 바로 저장돼요.'>
          {draft && <Panel>
            <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label={draft.enabled ? "게이머 메인 화면에 보여요" : "숨김 (게이머에게 안 보여요)"} />
            <Field label="제목"><input value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="내용"><textarea rows={8} value={draft.body} maxLength={4000} onChange={(e) => set({ body: e.target.value })} /></Field>
            <Grid><Field label="순서" hint="숫자가 클수록 위에 보여요."><NumberInput value={draft.displayOrder} min={-999} max={999} onChange={(displayOrder) => set({ displayOrder })} /></Field></Grid>
          </Panel>}
        </EditorPane>}
      />
    </div>
  );
}

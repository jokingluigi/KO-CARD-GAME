import { useCallback, useEffect, useState } from "react";
const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/tags`;
type Card = { id: string; name: string; tags: string[]; status: string; rarity: string; cost: number; attack: number; health: number };
export function AdminTagManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const check = useCallback(async (response: Response) => {
    if (response.status === 401) { onUnauthorized(); throw new Error("로그인이 필요합니다."); }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message ?? "태그 설정을 처리하지 못했습니다.");
    }
    return response.json();
  }, [onUnauthorized]);
  const load = useCallback(async () => {
    const data = await check(await fetch(base, { credentials: "include", cache: "no-store" }));
    setTags(data.tags); setCards(data.cards);
    setSelected(current => data.tags.includes(current) ? current : data.tags[0] ?? "");
  }, [check]);
  useEffect(() => {
    let live = true;
    void load().catch(reason => { if (live) setError(reason.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load]);
  async function change(path: string, method: string, body: object | undefined, success: string) {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      await check(await fetch(base + path, { method, credentials: "include", headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}) }));
      await load(); setMessage(success); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "태그를 저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }
  async function create() {
    const name = draft.trim(); if (!name) return;
    if (await change("", "POST", { name }, "태그를 추가했습니다.")) { setSelected(name); setDraft(""); }
  }
  const attached = cards.filter(card => card.tags.includes(selected));
  const visible = cards.filter(card => card.name.toLocaleLowerCase().includes(cardSearch.trim().toLocaleLowerCase()) &&
    (filter === "ALL" || (filter === "ATTACHED") === card.tags.includes(selected)));
  const input = "min-w-0 rounded border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-primary";
  return <section data-testid="admin-tag-manager">
    <h2 className="text-xl font-black text-primary">태그 관리</h2>
    <p className="mt-2 text-sm text-neutral-400">태그를 선택하고 선수 카드를 연결하거나 해제하세요. 카드별 태그 개수 제한은 없습니다.</p>
    <form className="mt-5 flex gap-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <input className={input + " flex-1"} aria-label="새 태그 이름" value={draft} onChange={event => setDraft(event.target.value)} placeholder="새 태그 이름" />
      <button disabled={busy || loading || !draft.trim()} className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-black text-black disabled:opacity-40">태그 추가</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
    {loading ? <p className="mt-5 text-neutral-400">태그를 불러오는 중...</p> : <div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="min-w-0">
        <input className={input + " w-full"} aria-label="태그 검색" placeholder="태그 검색" value={tagSearch} onChange={event => setTagSearch(event.target.value)} />
        <div className="mt-3 max-h-96 space-y-1 overflow-y-auto">
          {tags.filter(tag => tag.includes(tagSearch.trim())).map(tag => <button key={tag} type="button" aria-pressed={selected === tag}
            disabled={busy} onClick={() => setSelected(tag)} className={"flex w-full items-start justify-between gap-2 rounded border px-3 py-2 text-left text-sm " +
              (selected === tag ? "border-primary text-primary" : "border-neutral-800 text-neutral-300")}>
            <span className="min-w-0 break-all">{tag}</span><span className="shrink-0 text-xs text-neutral-500">{cards.filter(card => card.tags.includes(tag)).length}장</span>
          </button>)}
          {tags.length === 0 && <p className="py-3 text-sm text-neutral-500">등록된 태그가 없습니다.</p>}
        </div>
      </aside>
      <div className="min-w-0">
        {selected ? <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="break-all text-lg font-black">{selected}</h3><p className="mt-1 text-xs text-neutral-400">연결된 선수 {attached.length}장</p></div>
            <button type="button" disabled={busy} className="shrink-0 rounded border border-red-900 px-3 py-2 text-xs text-red-300 disabled:opacity-40"
              onClick={() => { if (window.confirm(`‘${selected}’ 태그를 삭제할까요? 모든 카드에서 이 태그가 제거됩니다. 카드 자체는 삭제되지 않습니다.`))
                void change("/" + encodeURIComponent(selected), "DELETE", undefined, "태그를 삭제했습니다."); }}>태그 삭제</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <input className={input + " flex-1"} aria-label="선수 카드 검색" placeholder="선수 카드 검색" value={cardSearch} onChange={event => setCardSearch(event.target.value)} />
            <select className={input} aria-label="태그 연결 필터" value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="ALL">모든 선수</option><option value="ATTACHED">연결된 선수</option><option value="AVAILABLE">미연결 선수</option>
            </select>
          </div>
          <p className="mt-2 text-xs text-neutral-500">체크하면 연결, 체크를 해제하면 해당 태그만 제거합니다. 공개·비공개·비활성 선수 모두 관리할 수 있습니다.</p>
          <p className="mt-3 text-xs text-neutral-400">현재 검색 결과 {visible.length}장 · 연결 {attached.length}장</p><div className="mt-3 max-h-[65vh] divide-y divide-neutral-800 overflow-y-auto border-y border-neutral-800">
            {visible.map(card => <label key={card.id} className="flex min-h-14 cursor-pointer items-start gap-3 px-2 py-3">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-amber-400" aria-label={card.name + " 태그 연결"}
                disabled={busy} checked={card.tags.includes(selected)} onChange={event => void change("/" + encodeURIComponent(selected) + "/cards/" + encodeURIComponent(card.id),
                  "PATCH", { attached: event.target.checked }, card.name + (event.target.checked ? "에 태그를 연결했습니다." : "에서 태그를 해제했습니다."))} />
              <span className="min-w-0 flex-1"><strong className="break-words text-sm">{card.name}</strong>
                <span className="ml-2 text-[10px] text-neutral-500">{card.status}</span>
                <span className="mt-1 block text-xs text-neutral-400">{card.cost}G · {card.attack}/{card.health} · {card.rarity}</span>
                <span className="mt-1 block break-words text-xs text-amber-300">{card.tags.join(" · ") || "태그 없음"}</span>
              </span>
            </label>)}
            {visible.length === 0 && <p className="py-5 text-sm text-neutral-500">조건에 맞는 선수 카드가 없습니다.</p>}
          </div>
        </> : <p className="text-sm text-neutral-500">태그를 추가하거나 왼쪽에서 선택하세요.</p>}
      </div>
    </div>}
  </section>;
}

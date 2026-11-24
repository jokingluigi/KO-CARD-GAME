import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tagLabel, updateTagLabels } from "@/lib/tag-labels";
import { adminFetch, Button, Chip, EditorPane, errorText, Field, ListPane, ListRow, Notice, Panel, RARITY_KO, SaveLine, Split, STATUS_KO, useAutosave, useMobileEditing } from "./admin-kit";

type Card = { id: string; name: string; tags: string[]; status: string; rarity: string; cost: number; attack: number; health: number; imageUrl?: string | null };
type TagData = { tags: string[]; cards: Card[]; labels?: Record<string, string> };

/** 태그 — 태그 이름을 고치고, 선수 여러 장에 한 번에 붙이거나 떼요. */
export function AdminTagManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<TagData | null>(null);
  const [selected, setSelected] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [show, setShow] = useState<"ALL" | "ON" | "OFF">("ALL");
  const [rarity, setRarity] = useState("");
  const [status, setStatus] = useState("");
  const [cost, setCost] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [rename, setRename] = useState<{ tag: string; name: string } | null>(null);
  const busy = useRef(false);
  const mobile = useMobileEditing();

  const load = useCallback(async () => {
    const body = await adminFetch<TagData>("/tags", { cache: "no-store" }, onUnauthorized);
    setData(body); updateTagLabels(body.labels ?? {});
    return body;
  }, [onUnauthorized]);
  useEffect(() => { void load().then((b) => setSelected((s) => s || b.tags[0] || "")).catch((e) => setNotice({ tone: "error", text: errorText(e, "태그를 불러오지 못했어요.") })); }, [load]);

  const label = useCallback((key: string) => tagLabel(key, data?.labels ?? {}), [data]);
  useEffect(() => { setChecked(new Set()); setRename(selected ? { tag: selected, name: label(selected) } : null); }, [selected]);

  const renameSave = useAutosave(rename?.tag ?? null, rename, async (next) => {
    if (!next.name.trim()) throw new Error("태그 이름을 써 주세요.");
    await adminFetch(`/tags/${encodeURIComponent(next.tag)}`, { method: "PATCH", json: { displayName: next.name.trim() } }, onUnauthorized);
    await load();
    return "이름 저장됨";
  });

  async function run(task: () => Promise<unknown>, ok: string) {
    if (busy.current) return false;
    busy.current = true; setNotice(null);
    try { const result = await task(); await load(); setNotice({ tone: "ok", text: ok + (result && typeof result === "object" && "affectedCards" in result ? ` (${(result as { affectedCards: number }).affectedCards}장 바뀜)` : "") }); return true; }
    catch (e) { setNotice({ tone: "error", text: errorText(e) }); return false; }
    finally { busy.current = false; }
  }
  async function addTag() {
    const name = window.prompt("새 태그 이름을 써 주세요.");
    if (!name?.trim()) return;
    if (await run(() => adminFetch("/tags", { method: "POST", json: { name: name.trim() } }, onUnauthorized), `'${name.trim()}' 태그를 만들었어요.`)) { setSelected(name.trim()); mobile.open(); }
  }
  async function removeTag() {
    const count = data?.cards.filter((c) => c.tags.includes(selected)).length ?? 0;
    if (!window.confirm(`'${label(selected)}' 태그를 지울까요?${count ? `\n붙어 있는 선수 ${count}장에서도 떨어져요.` : ""}\n이 태그를 쓰는 카드 효과가 있다면 작동하지 않게 돼요.`)) return;
    if (await run(() => adminFetch(`/tags/${encodeURIComponent(selected)}`, { method: "DELETE" }, onUnauthorized), "태그를 지웠어요.")) { setSelected(data?.tags.find((t) => t !== selected) ?? ""); mobile.back(); }
  }
  async function bulk(attached: boolean) {
    const ids = [...checked]; if (!ids.length) return;
    if (await run(() => adminFetch(`/tags/${encodeURIComponent(selected)}/cards`, { method: "PATCH", json: { cardIds: ids, attached } }, onUnauthorized), `${ids.length}장에 '${label(selected)}' 태그를 ${attached ? "붙였어요" : "뗐어요"}.`)) setChecked(new Set());
  }
  async function toggleOne(card: Card) {
    const attached = !card.tags.includes(selected);
    await run(() => adminFetch(`/tags/${encodeURIComponent(selected)}/cards/${encodeURIComponent(card.id)}`, { method: "PATCH", json: { attached } }, onUnauthorized), `${card.name}에 태그를 ${attached ? "붙였어요" : "뗐어요"}.`);
  }

  const cards = useMemo(() => (data?.cards ?? [])
    .filter((c) => cardSearch.trim().split(/\s+/).filter(Boolean).every((w) => c.name.includes(w) || c.tags.some((t) => label(t).includes(w))))
    .filter((c) => (!status || c.status === status) && (cost === "" || c.cost === Number(cost)))
    .filter((c) => show === "ALL" || (show === "ON") === c.tags.includes(selected))
    .filter((c) => !rarity || c.rarity === rarity)
    .sort((a, b) => Number(b.tags.includes(selected)) - Number(a.tags.includes(selected)) || a.name.localeCompare(b.name, "ko")), [data, cardSearch, show, rarity, selected]);

  if (!data) return notice ? <Notice tone="error">{notice.text}</Notice> : <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const tags = data.tags.filter((t) => !tagSearch.trim() || label(t).includes(tagSearch.trim()));
  const countOf = (t: string) => data.cards.filter((c) => c.tags.includes(t)).length;
  const allShownChecked = cards.length > 0 && cards.every((c) => checked.has(c.id));

  return (
    <div className="ak-page">
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void addTag()}>+ 새 태그</button>} search={tagSearch} onSearch={setTagSearch} placeholder="태그 찾기" count={`태그 ${data.tags.length}개`}>
          {tags.map((t) => <ListRow key={t} selected={t === selected} onClick={() => { void renameSave.flush(); setSelected(t); mobile.open(); }} title={label(t)} badge={`${countOf(t)}장`} tone={countOf(t) ? "on" : "off"} />)}
        </ListPane>}
        editor={<EditorPane onBack={() => { void renameSave.flush(); mobile.back(); }} status={<SaveLine state={renameSave.state} idle={`선수 ${countOf(selected)}장에 붙어 있어요`} />} right={selected && <Button kind="danger" onClick={() => void removeTag()}>태그 지우기</Button>}>
          {selected && rename && <>
            <Panel>
              <Field label="태그 이름" hint="이름만 바뀌어요. 붙어 있는 선수와 카드 효과는 그대로 작동해요."><input value={rename.name} maxLength={30} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>
            </Panel>
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <Panel title="선수에게 붙이기 · 떼기" hint="카드를 하나씩 눌러 바로 붙이거나 떼요. 여러 장은 체크한 뒤 아래 버튼을 누르세요.">
              <div className="ak-row-actions">
                <input className="ak-search" style={{ flex: 1, minWidth: 160 }} placeholder="선수 이름·태그 찾기 (여러 단어 가능)" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} />
                <select className="ak-search" value={rarity} onChange={(e) => setRarity(e.target.value)}><option value="">모든 등급</option>{["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"].map((r) => <option key={r} value={r}>{RARITY_KO[r]}</option>)}</select>
                <select className="ak-search" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">모든 상태</option><option value="PUBLISHED">공개</option><option value="DRAFT">미공개</option><option value="DISABLED">비활성</option></select>
                <select className="ak-search" value={cost} onChange={(e) => setCost(e.target.value)}><option value="">모든 비용</option>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}골드</option>)}</select>
              </div>
              <div className="ak-chips">
                {([["ALL", "전체"], ["ON", "붙은 선수"], ["OFF", "안 붙은 선수"]] as const).map(([v, l]) => <Chip key={v} on={show === v} onClick={() => setShow(v)}>{l}</Chip>)}
              </div>
              <div className="ak-row-actions" style={{ alignItems: "center" }}>
                <Button kind="ghost" onClick={() => setChecked(allShownChecked ? new Set() : new Set(cards.map((c) => c.id)))}>{allShownChecked ? "체크 모두 풀기" : `보이는 ${cards.length}장 모두 체크`}</Button>
                <Button kind="primary" disabled={!checked.size} onClick={() => void bulk(true)}>체크한 {checked.size}장에 붙이기</Button>
                <Button disabled={!checked.size} onClick={() => void bulk(false)}>체크한 {checked.size}장에서 떼기</Button>
              </div>
              <ul className="ak-checklist">
                {cards.map((c) => {
                  const on = c.tags.includes(selected);
                  return (
                    <li key={c.id} data-on={on || undefined}>
                      <input type="checkbox" aria-label={`${c.name} 체크`} checked={checked.has(c.id)} onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                      <span className="ak-thumb" style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})`, width: 30, height: 38 } : { width: 30, height: 38 }} />
                      <span className="ak-row-main"><b>{c.name}</b><small>{c.cost}골드 · {c.attack}/{c.health} · {RARITY_KO[c.rarity] ?? c.rarity}{c.status !== "PUBLISHED" ? ` · ${STATUS_KO[c.status] ?? c.status}` : ""} · {c.tags.map(label).join(", ") || "태그 없음"}</small></span>
                      <Chip on={on} onClick={() => void toggleOne(c)}>{on ? "붙어 있음" : "붙이기"}</Chip>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </>}
        </EditorPane>}
      />
    </div>
  );
}

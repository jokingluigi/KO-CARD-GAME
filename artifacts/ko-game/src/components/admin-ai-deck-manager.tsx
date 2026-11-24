import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { compatibleAISkins } from "@/lib/ai-deck-import";
import {
  deleteAdminAIDeck, duplicateAdminAIDeck, fetchAdminAIDeckOptions, fetchAdminAIDecks, saveAdminAIDeck, setAdminAIDeckEnabled, testAdminAIDeck,
  type AIDeck, type AIDeckCard, type AIDeckOptions,
} from "@/lib/ai-decks-client";
import { ROUTES } from "@/lib/routes";
import { AIDeckCodeImport } from "./ai-deck-code-import";
import { AIDeckSkinEditor } from "./ai-deck-skin-editor";
import { Button, Chip, EditorPane, errorText, Field, Grid, ListPane, ListRow, Notice, NumberInput, Panel, RARITY_KO, SaveLine, Split, Tabs, Toggle, useAutosave, useMobileEditing } from "./admin-kit";

type Draft = { id: string; name: string; description: string; championDefinitionId: string | null; cardDefinitionIds: string[]; cosmeticIds: string[]; difficulty: AIDeck["difficulty"]; enabled: boolean; displayOrder: number };
const toDraft = (d: AIDeck): Draft => ({ id: d.id, name: d.name, description: d.description, championDefinitionId: d.championDefinitionId, cardDefinitionIds: d.cardDefinitionIds, cosmeticIds: d.cosmeticIds ?? [], difficulty: "BOSS", enabled: d.enabled, displayOrder: d.displayOrder });

/** AI 대전 — AI가 쓸 챔피언과 덱. 고치면 바로 저장돼요. */
export function AdminAIDeckManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [, navigate] = useLocation();
  const [decks, setDecks] = useState<AIDeck[] | null>(null);
  const [options, setOptions] = useState<AIDeckOptions | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"deck" | "champion" | "look">("deck");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "WRESTLER" | "TECHNIQUE">("");
  const [rarity, setRarity] = useState("");
  const [error, setError] = useState("");
  const mobile = useMobileEditing();

  async function load() {
    try {
      const [d, o] = await Promise.all([fetchAdminAIDecks(), fetchAdminAIDeckOptions()]);
      setDecks(d.decks); setOptions(o); return d.decks;
    } catch (e) { if (/로그인|관리자/.test(errorText(e))) onUnauthorized(); setError(errorText(e, "AI 덱을 불러오지 못했어요.")); setDecks([]); return []; }
  }
  useEffect(() => { void load(); }, []);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    if (!next.name.trim()) throw new Error("덱 이름을 써 주세요.");
    if (!next.cardDefinitionIds.length) throw new Error("덱에 카드가 한 장은 있어야 저장돼요.");
    const { enabled: _e, ...rest } = next;
    const current = decks?.find((d) => d.id === next.id);
    const result = await saveAdminAIDeck({ ...rest, enabled: current?.enabled ?? false });
    setDecks((list) => list?.map((d) => (d.id === result.deck.id ? result.deck : d)) ?? list);
    return result.deck.isValid ? "저장됨" : "저장됨 · 아직 대전에 못 써요";
  });

  function select(d: AIDeck) { void autosave.flush(); setSelectedId(d.id); setDraft(toDraft(d)); mobile.open(); }

  async function create() {
    try {
      const result = await saveAdminAIDeck({ name: "새 AI 덱", description: "", championDefinitionId: options?.champions.find((c) => c.status === "PUBLISHED")?.id ?? null, cardDefinitionIds: [options?.cards.find((c) => c.status === "PUBLISHED" && !c.isToken && !c.isChampionToken)?.id].filter((id): id is string => Boolean(id)), cosmeticIds: [], difficulty: "BOSS", enabled: false, displayOrder: 0 });
      setDecks((list) => [...(list ?? []), result.deck]); select(result.deck); setTab("deck");
    } catch (e) { setError(errorText(e, "AI 덱을 만들지 못했어요.")); }
  }
  async function setEnabled(enabled: boolean) {
    if (!draft) return;
    await autosave.flush();
    try {
      const result = await setAdminAIDeckEnabled(draft.id, enabled);
      setDecks((list) => list?.map((d) => (d.id === result.deck.id ? result.deck : d)) ?? list);
      const next = { ...draft, enabled: result.deck.enabled }; autosave.markSaved(next); setDraft(next);
      autosave.setState({ kind: "saved", message: enabled ? "대전에 나오게 했어요" : "대전에서 뺐어요" });
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "켜지 못했어요.") }); }
  }
  async function duplicate() {
    if (!draft) return;
    try { const r = await duplicateAdminAIDeck(draft.id); setDecks((l) => [...(l ?? []), r.deck]); select(r.deck); window.setTimeout(() => autosave.setState({ kind: "saved", message: "복제했어요 (꺼짐)" }), 50); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "복제하지 못했어요.") }); }
  }
  async function remove() {
    if (!draft || !window.confirm(`'${draft.name}' AI 덱을 지울까요?`)) return;
    try { await deleteAdminAIDeck(draft.id); setDecks((l) => l?.filter((d) => d.id !== draft.id) ?? l); setDraft(null); setSelectedId(null); mobile.back(); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function test() {
    if (!draft) return;
    await autosave.flush();
    try { await testAdminAIDeck(draft.id); navigate(`${ROUTES.AI_MATCH}?source=admin&aiDeckId=${encodeURIComponent(draft.id)}`); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "테스트를 시작하지 못했어요.") }); }
  }

  const cardsById = useMemo(() => new Map((options?.cards ?? []).map((c) => [c.id, c])), [options]);
  const counts = useMemo(() => { const m = new Map<string, number>(); draft?.cardDefinitionIds.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1)); return m; }, [draft?.cardDefinitionIds]);
  const pool = useMemo(() => (options?.cards ?? [])
    .filter((c) => !c.isToken && !c.isChampionToken && c.status !== "DISABLED")
    .filter((c) => (!type || c.cardType === type) && (!rarity || c.rarity === rarity) && (!q.trim() || c.name.includes(q.trim())))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko")), [options, type, rarity, q]);

  if (!decks) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const max = options?.maxCardCount ?? 25, min = options?.minCardCount ?? 25;
  const deck = decks.find((d) => d.id === draft?.id);
  const add = (c: AIDeckCard) => { if (!draft || draft.cardDefinitionIds.length >= max) return; set({ cardDefinitionIds: [...draft.cardDefinitionIds, c.id] }); };
  const sub = (id: string) => { if (!draft) return; const i = draft.cardDefinitionIds.lastIndexOf(id); if (i < 0) return; const ids = [...draft.cardDefinitionIds.slice(0, i), ...draft.cardDefinitionIds.slice(i + 1)]; set({ cardDefinitionIds: ids, cosmeticIds: ids.includes(id) ? draft.cosmeticIds : draft.cosmeticIds.filter((cid) => !options?.cosmetics?.some((it) => it.id === cid && it.type === "CARD_SKIN" && it.targetId === id)) }); };
  const champion = options?.champions.find((c) => c.id === draft?.championDefinitionId);

  return (
    <div className="ak-page">
      {error && <Notice tone="error">{error}</Notice>}
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 AI 덱</button>} count={`${decks.length}개 · 대전에 나옴 ${decks.filter((d) => d.enabled).length}개`}>
          {decks.map((d) => <ListRow key={d.id} thumb={d.champion?.imageUrl ?? null} selected={d.id === selectedId} onClick={() => select(d)} title={d.name} sub={`${d.champion?.name ?? "챔피언 없음"} · ${d.cardDefinitionIds.length}장`} badge={!d.isValid ? "덱 미완성" : d.enabled ? "나옴" : "꺼짐"} tone={!d.isValid ? "warn" : d.enabled ? "on" : "off"} />)}
          {!decks.length && <p className="ak-hint" style={{ margin: 8 }}>AI 덱이 없어요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />} right={draft && <><Button onClick={() => void test()}>테스트 대전</Button><Button onClick={() => void duplicate()}>복제</Button><Button kind="danger" onClick={() => void remove()}>지우기</Button></>}>
          {draft && <>
            <Panel>
              <Toggle checked={draft.enabled} onChange={(v) => void setEnabled(v)} label={draft.enabled ? "AI 대전에 나와요" : "꺼짐 (대전에 안 나와요)"} hint={deck && !deck.isValid ? "덱을 다 채워야 켤 수 있어요" : undefined} />
              {deck && !deck.isValid && <Notice tone="warn">아직 대전에 못 써요: {deck.invalidReasons.join(" ")}</Notice>}
              {draft.cardDefinitionIds.some((id) => !cardsById.has(id)) && <Notice tone="error">지워진 카드가 덱에 있어요. 아래 덱에서 ‘없는 카드’를 눌러 빼 주세요.</Notice>}
              {deck && (deck.requiredCardDefinitionIds ?? []).some((id) => !cardsById.has(id)) && <Notice tone="error">이 덱의 카드 효과나 챔피언 토큰이 쓰는 카드 중 지워진 것이 있어요: {(deck.requiredCardDefinitionIds ?? []).filter((id) => !cardsById.has(id)).join(", ")} — 자동으로 바꾸지 않으니 덱을 확인해 주세요.</Notice>}
              <Grid>
                <Field label="덱 이름"><input value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="보이는 순서" hint="작을수록 앞"><NumberInput value={draft.displayOrder} min={-999} max={999} onChange={(displayOrder) => set({ displayOrder })} /></Field>
              </Grid>
              <Field label="설명 (선택)"><textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            </Panel>
            <Tabs<"deck" | "champion" | "look"> value={tab} onChange={setTab} tabs={[["deck", `덱 ${draft.cardDefinitionIds.length}/${max}장`], ["champion", `챔피언 · ${champion?.name ?? "없음"}`], ["look", "스킨 · 덱 코드"]] as const} />
            {tab === "champion" && <Panel title="챔피언 고르기">
              <div className="ak-pick-grid">
                {(options?.champions ?? []).filter((c) => c.status !== "DISABLED").map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === draft.championDefinitionId} onClick={() => set({ championDefinitionId: c.id, cosmeticIds: options ? compatibleAISkins(draft.cosmeticIds, options, c.id, draft.cardDefinitionIds) : draft.cosmeticIds })}>
                    <span className="ak-thumb" style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : undefined} /><b>{c.name}</b><small>체력 {c.maxHealth}{c.status !== "PUBLISHED" ? " · 미공개" : ""}</small>
                  </button>
                ))}
              </div>
            </Panel>}
            {tab === "deck" && <>
              <Panel title={`지금 덱 (${draft.cardDefinitionIds.length}장 · ${min === max ? `${max}장 필요` : `${min}~${max}장`})`} right={draft.cardDefinitionIds.length > 0 && <Button kind="ghost" onClick={() => { if (window.confirm("덱을 모두 비울까요?")) set({ cardDefinitionIds: [] }); }}>모두 비우기</Button>}>
                <div className="ak-deck">
                  {[...counts.entries()].map(([id, n]) => ({ card: cardsById.get(id), id, n })).sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99)).map(({ card, id, n }) => (
                    <button key={id} type="button" onClick={() => sub(id)} title="눌러서 한 장 빼기"><em>{card?.cost ?? "?"}</em><b>{card?.name ?? "없는 카드"}</b><i>×{n}</i></button>
                  ))}
                  {!draft.cardDefinitionIds.length && <p className="ak-hint">아래에서 카드를 눌러 넣으세요.</p>}
                </div>
              </Panel>
              <Panel title="카드 넣기" hint="누르면 한 장씩 들어가요. 위 덱에서 누르면 한 장씩 빠져요.">
                <div className="ak-row-actions">
                  <input className="ak-search" style={{ flex: 1, minWidth: 140 }} placeholder="카드 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
                  <select className="ak-search" value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="">선수·기술</option><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select>
                  <select className="ak-search" value={rarity} onChange={(e) => setRarity(e.target.value)}><option value="">모든 등급</option>{["NORMAL", "EPIC", "LEGENDARY"].map((r) => <option key={r} value={r}>{RARITY_KO[r]}</option>)}</select>
                </div>
                <div className="ak-deck ak-deck-pool">
                  {pool.map((c) => <button key={c.id} type="button" disabled={draft.cardDefinitionIds.length >= max} onClick={() => add(c)}><em>{c.cost}</em><b>{c.name}</b><i>{counts.get(c.id) ? `×${counts.get(c.id)}` : "+"}</i></button>)}
                </div>
              </Panel>
            </>}
            {tab === "look" && options && <>
              <Panel title="덱 코드로 한 번에 넣기"><AIDeckCodeImport options={options} busy={false} onApply={(imported) => set({ name: draft.name.trim() ? draft.name : imported.name, championDefinitionId: imported.championDefinitionId, cardDefinitionIds: imported.cardDefinitionIds, cosmeticIds: compatibleAISkins(draft.cosmeticIds, options, imported.championDefinitionId, imported.cardDefinitionIds) })} /></Panel>
              <Panel title="AI가 쓸 스킨"><AIDeckSkinEditor options={options} championId={draft.championDefinitionId} cardIds={draft.cardDefinitionIds} selectedIds={draft.cosmeticIds} onChange={(cosmeticIds) => set({ cosmeticIds })} busy={false} /></Panel>
            </>}
          </>}
        </EditorPane>}
      />
    </div>
  );
}

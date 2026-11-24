import { useEffect, useMemo, useState } from "react";
import { shopDeckRequest, deckCounts, type ShopDeckCatalog, type ShopDeckProduct } from "@/lib/shop-decks-client";
import { maxCardCopies } from "../../../../lib/game-engine/src/rules";
import { ShopDeckDetail } from "./shop-deck-detail";
import { Button, EditorPane, errorText, Field, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel, RARITY_KO, SaveLine, Split, Toggle, useAutosave, useMobileEditing } from "./admin-kit";

const DECK_SIZE = 25;
const blank = (): ShopDeckProduct => ({ id: "", name: "새 완성 덱", description: "", imageUrl: null, cardDefinitionIds: [], price: 500, recommendedChampionId: null, includeChampion: false, allowUnpublished: false, enabled: false, displayOrder: 0 });

/** 상점 · 완성 덱 — 25장 덱을 상품으로 팔아요. 덱을 다 채우면 바로 저장돼요. */
export function AdminShopDecks() {
  const [data, setData] = useState<ShopDeckCatalog | null>(null);
  const [form, setForm] = useState<ShopDeckProduct | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [cost, setCost] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const mobile = useMobileEditing();

  async function load() { const d = await shopDeckRequest<ShopDeckCatalog>("/admin/shop-decks"); setData(d); return d; }
  useEffect(() => { void load().catch((e) => setError(errorText(e, "완성 덱을 불러오지 못했어요."))); }, []);

  const byId = useMemo(() => new Map(data?.cards.map((c) => [c.id, c]) ?? []), [data]);
  const problems = useMemo(() => {
    if (!form) return [];
    const out: string[] = [];
    const counts = deckCounts(form.cardDefinitionIds);
    if (form.cardDefinitionIds.length !== DECK_SIZE) out.push(`카드가 ${DECK_SIZE}장이어야 해요 (지금 ${form.cardDefinitionIds.length}장)`);
    const legendary = form.cardDefinitionIds.filter((id) => byId.get(id)?.rarity === "LEGENDARY").length;
    if (legendary > 3) out.push("레전더리는 모두 합쳐 3장까지예요");
    for (const [id, n] of counts) {
      const c = byId.get(id);
      if (!c || c.isToken || c.isChampionToken || !(c.status === "PUBLISHED" || (form.allowUnpublished && c.status === "DRAFT"))) out.push(`${c?.name ?? "없는 카드"}: 팔 수 없는 카드예요`);
      else if (n > maxCardCopies(c.rarity)) out.push(`${c.name}: ${maxCardCopies(c.rarity)}장까지만 넣을 수 있어요`);
    }
    if (form.includeChampion && !form.recommendedChampionId) out.push("함께 줄 챔피언을 골라 주세요");
    if (!form.name.trim()) out.push("덱 이름을 써 주세요");
    return out;
  }, [form, byId]);

  const autosave = useAutosave(form?.id || (form ? "new" : null), form, async (next) => {
    if (problems.length) throw new Error(`아직 저장 안 돼요 · ${problems[0]}`);
    const r = await shopDeckRequest<{ item: ShopDeckProduct }>(`/admin/shop-decks${next.id ? "/" + encodeURIComponent(next.id) : ""}`, { method: next.id ? "PATCH" : "POST", body: JSON.stringify(next) });
    if (!next.id) { autosave.markSaved(r.item); setForm(r.item); }
    await load();
    return next.id ? "저장됨" : "덱 상품을 만들었어요";
  }, 1000);

  function open(item: ShopDeckProduct) { void autosave.flush(); setForm({ ...item }); mobile.open(); }
  async function remove() {
    if (!form) return;
    if (!form.id) { setForm(null); mobile.back(); return; }
    if (!window.confirm(`"${form.name}" 덱 상품을 지울까요?\n이미 산 사람이 있으면 지울 수 없어요. (그때는 판매만 끄세요)`)) return;
    try { await shopDeckRequest(`/admin/shop-decks/${encodeURIComponent(form.id)}`, { method: "DELETE" }); setForm(null); mobile.back(); await load(); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function stopSale() {
    if (!form?.id) return;
    try {
      const r = await shopDeckRequest<{ item: ShopDeckProduct }>(`/admin/shop-decks/${encodeURIComponent(form.id)}/disable`, { method: "POST" });
      autosave.markSaved(r.item); setForm(r.item); await load();
      autosave.setState({ kind: "saved", message: "판매를 멈췄어요. 이미 산 사람의 덱은 그대로예요." });
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "판매를 멈추지 못했어요.") }); }
  }
  async function upload(file: File) {
    if (!form) return;
    setUploading(true);
    try {
      const r = await shopDeckRequest<{ uploadURL: string; objectPath: string }>("/admin/shop-decks/uploads", { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) });
      const put = await fetch(r.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type }, signal: AbortSignal.timeout(30000) });
      if (!put.ok) throw new Error("그림을 올리지 못했어요.");
      const done = await shopDeckRequest<{ imageUrl: string }>("/admin/shop-decks/uploads/complete", { method: "POST", body: JSON.stringify({ objectPath: r.objectPath, contentType: file.type }) });
      setForm({ ...form, imageUrl: done.imageUrl });
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(false); }
  }

  const counts = useMemo(() => deckCounts(form?.cardDefinitionIds ?? []), [form?.cardDefinitionIds]);
  const pool = useMemo(() => (data?.cards ?? [])
    .filter((c) => !c.isToken && !c.isChampionToken && ["WRESTLER", "TECHNIQUE"].includes(c.cardType) && ["NORMAL", "EPIC", "LEGENDARY"].includes(c.rarity))
    .filter((c) => c.status === "PUBLISHED" || (form?.allowUnpublished && c.status === "DRAFT"))
    .filter((c) => (!q.trim() || c.name.includes(q.trim())) && (cost === "" || c.cost === Number(cost))), [data, form?.allowUnpublished, q, cost]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const set = (patch: Partial<ShopDeckProduct>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const add = (id: string) => { if (!form || form.cardDefinitionIds.length >= DECK_SIZE) return; const c = byId.get(id); if (c && (counts.get(id) ?? 0) >= maxCardCopies(c.rarity)) return; set({ cardDefinitionIds: [...form.cardDefinitionIds, id] }); };
  const sub = (id: string) => { if (!form) return; const i = form.cardDefinitionIds.lastIndexOf(id); if (i >= 0) set({ cardDefinitionIds: [...form.cardDefinitionIds.slice(0, i), ...form.cardDefinitionIds.slice(i + 1)] }); };

  return (
    <div className="ak-page">
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => { void autosave.flush(); setForm(blank()); mobile.open(); }}>+ 새 완성 덱</button>} count={`${data.items.length}개 · 판매 중 ${data.items.filter((i) => i.enabled).length}개`}>
          {data.items.map((i) => <ListRow key={i.id} thumb={i.imageUrl} selected={i.id === form?.id} onClick={() => open(i)} title={i.name} sub={`${i.price.toLocaleString()} 크레딧 · ${i.cardDefinitionIds.length}장`} badge={i.enabled ? "판매 중" : "꺼짐"} tone={i.enabled ? "on" : "off"} />)}
          {!data.items.length && <p className="ak-hint" style={{ margin: 8 }}>완성 덱 상품이 없어요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={problems.length ? { kind: "idle", message: `덱을 다 채우면 저장돼요 · ${problems[0]}` } : autosave.state} />}
          right={form && <><Button onClick={() => setPreview(true)}>게이머 화면 미리보기</Button><Button kind="danger" onClick={() => void remove()}>{form.id ? "지우기" : "취소"}</Button></>}
          empty="왼쪽에서 덱을 고르거나 새로 만들어 보세요. 각 덱은 계정당 한 번만 살 수 있어요.">
          {form && <>
            <Panel>
              <Toggle checked={form.enabled} onChange={(enabled) => { if (!enabled && form.id) void stopSale(); else set({ enabled }); }} label={form.enabled ? "판매 중" : "판매 꺼짐"} hint={form.enabled ? "끄면 덱이 덜 채워졌어도 바로 판매를 멈춰요" : undefined} />
              <Grid>
                <Field label="덱 이름"><input value={form.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="가격 (크레딧)"><NumberInput value={form.price} min={0} step={50} onChange={(price) => set({ price })} /></Field>
              </Grid>
              <Field label="설명"><textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Grid>
                <Field label="추천 챔피언"><select value={form.recommendedChampionId ?? ""} onChange={(e) => set({ recommendedChampionId: e.target.value || null, includeChampion: e.target.value ? form.includeChampion : false })}><option value="">없음 (산 사람의 챔피언 사용)</option>{data.champions.filter((c) => c.status === "PUBLISHED" || (form.allowUnpublished && c.status === "DRAFT")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="보이는 순서" hint="작을수록 앞"><NumberInput value={form.displayOrder} min={-999} max={999} onChange={(displayOrder) => set({ displayOrder })} /></Field>
              </Grid>
              {form.recommendedChampionId && <Toggle checked={form.includeChampion} onChange={(includeChampion) => set({ includeChampion })} label="추천 챔피언도 함께 주기" />}
              <Toggle checked={form.allowUnpublished} onChange={(allowUnpublished) => set({ allowUnpublished })} label="미공개 카드·챔피언도 넣기" hint="켜면 미공개 카드도 산 사람에게 실제로 지급돼요." />
            </Panel>
            <Panel title="대표 그림">
              {form.imageUrl && <img className="ak-preview-img" src={form.imageUrl} alt="" />}
              <div className="ak-row-actions"><ImagePick label="그림 올리기" busy={uploading} onFile={(f) => void upload(f)} />{form.imageUrl && <Button kind="ghost" onClick={() => set({ imageUrl: null })}>그림 빼기</Button>}</div>
            </Panel>
            <Panel title={`덱 ${form.cardDefinitionIds.length}/${DECK_SIZE}장`} hint="덱에서 누르면 한 장 빠지고, 아래에서 누르면 한 장 들어가요. 레전더리는 3장까지." right={form.cardDefinitionIds.length > 0 && <Button kind="ghost" onClick={() => { if (window.confirm("덱을 모두 비울까요?")) set({ cardDefinitionIds: [] }); }}>모두 비우기</Button>}>
              {problems.length > 0 && <Notice tone="warn">{problems.join(" · ")}</Notice>}
              <div className="ak-deck">
                {[...counts.entries()].map(([id, n]) => ({ c: byId.get(id), id, n })).sort((a, b) => (a.c?.cost ?? 99) - (b.c?.cost ?? 99)).map(({ c, id, n }) => <button key={id} type="button" onClick={() => sub(id)}><em>{c?.cost ?? "?"}</em><b>{c?.name ?? "없는 카드"}</b><i>×{n}</i></button>)}
              </div>
            </Panel>
            <Panel title="카드 넣기">
              <div className="ak-row-actions">
                <input className="ak-search" style={{ flex: 1, minWidth: 140 }} placeholder="카드 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
                <select className="ak-search" value={cost} onChange={(e) => setCost(e.target.value)}><option value="">모든 비용</option>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}골드</option>)}</select>
              </div>
              <div className="ak-deck ak-deck-pool">
                {pool.map((c) => { const n = counts.get(c.id) ?? 0, max = maxCardCopies(c.rarity); return <button key={c.id} type="button" disabled={n >= max || form.cardDefinitionIds.length >= DECK_SIZE} onClick={() => add(c.id)} title={`${RARITY_KO[c.rarity] ?? c.rarity} · ${max}장까지`}><em>{c.cost}</em><b>{c.name}</b><i>{n ? `${n}/${max}` : "+"}</i></button>; })}
              </div>
            </Panel>
          </>}
        </EditorPane>}
      />
      {preview && form && <ShopDeckDetail product={{ ...form, cards: data.cards, recommendedChampion: data.champions.find((c) => c.id === form.recommendedChampionId) ?? null } as never} onClose={() => setPreview(false)} />}
    </div>
  );
}

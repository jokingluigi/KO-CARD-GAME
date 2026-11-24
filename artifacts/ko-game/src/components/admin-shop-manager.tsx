import { useEffect, useMemo, useState } from "react";
import {
  adminFetch, Button, EditorPane, errorText, Field, fromLocalInput, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel,
  SaveLine, Split, toLocalInput, Toggle, uploadAdminImage, useAutosave, useMobileEditing,
} from "./admin-kit";

type Pack = { id: string; name: string; description: string; imageUrl: string | null; status: string; deletedAt: string | null };
type Listing = {
  id: string; name: string; description: string; imageAssetId: string | null; imageUrl: string | null; productType: "PACK"; packDefinitionId: string;
  quantity: number; price: number; enabled: boolean; displayOrder: number; startsAt: string | null; endsAt: string | null; pack?: Pack; packUnavailable?: boolean; isSaleable?: boolean;
};
type ShopData = { listings: Listing[]; packs: Pack[]; currencyDisplayName: string };

const payload = (l: Listing) => ({
  name: l.name, description: l.description, imageAssetId: l.imageAssetId, productType: "PACK", packDefinitionId: l.packDefinitionId,
  quantity: l.quantity, price: l.price, enabled: l.enabled, displayOrder: l.displayOrder, startsAt: l.startsAt, endsAt: l.endsAt,
});

/** 상점 · 판매 상품 — 카드팩을 얼마에 팔지 정해요. 고치면 바로 저장돼요. */
export function AdminShopManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const mobile = useMobileEditing();

  async function load() {
    try { const body = await adminFetch<ShopData>("/shop", undefined, onUnauthorized); setData(body); return body; }
    catch (e) { setError(errorText(e, "상점을 불러오지 못했어요.")); return null; }
  }
  useEffect(() => { void load(); }, []);

  const currency = data?.currencyDisplayName ?? "크레딧";
  const publishedPacks = (data?.packs ?? []).filter((p) => p.status === "PUBLISHED" && !p.deletedAt);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    if (!next.name.trim()) throw new Error("상품 이름을 써 주세요.");
    if (next.startsAt && next.endsAt && next.endsAt < next.startsAt) throw new Error("끝나는 시간이 시작보다 앞이에요.");
    const body = await adminFetch<{ listing: Listing }>(`/shop/${encodeURIComponent(next.id)}`, { method: "PATCH", json: payload(next) }, onUnauthorized);
    setData((d) => d && ({ ...d, listings: d.listings.map((l) => (l.id === next.id ? { ...l, ...body.listing } : l)) }));
    void adminFetch<ShopData>("/shop", undefined, onUnauthorized).then(setData).catch(() => {}); // refresh "판매 중 / 기간 밖" badges
  });

  function select(l: Listing) { void autosave.flush(); setSelectedId(l.id); setDraft({ ...l }); mobile.open(); }

  async function create() {
    const pack = publishedPacks[0];
    if (!pack) { setError("팔 수 있는 카드팩이 없어요. 먼저 ‘카드팩’ 화면에서 팩을 만들고 공개해 주세요."); return; }
    try {
      const body = await adminFetch<{ listing: Listing }>("/shop", { method: "POST", json: { name: pack.name, description: pack.description ?? "", imageAssetId: null, productType: "PACK", packDefinitionId: pack.id, quantity: 1, price: 100, enabled: false, displayOrder: 0, startsAt: null, endsAt: null } }, onUnauthorized);
      await load(); select(body.listing);
    } catch (e) { setError(errorText(e, "상품을 만들지 못했어요.")); }
  }
  async function duplicate() {
    if (!draft) return;
    try { const made = await adminFetch<{ listing: Listing }>(`/shop/${encodeURIComponent(draft.id)}/duplicate`, { method: "POST" }, onUnauthorized); const body = await load(); const copy = body?.listings.find((l) => l.id === made.listing.id); if (copy) select(copy); window.setTimeout(() => autosave.setState({ kind: "saved", message: "복제했어요 (판매 꺼짐)" }), 50); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "복제하지 못했어요.") }); }
  }
  async function remove() {
    if (!draft || !window.confirm(`"${draft.name}" 상품을 지울까요?\n이미 산 기록은 남아요.`)) return;
    try { await adminFetch(`/shop/${encodeURIComponent(draft.id)}`, { method: "DELETE" }, onUnauthorized); setDraft(null); setSelectedId(null); mobile.back(); await load(); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function upload(file: File) {
    if (!draft) return;
    setUploading(true);
    try { const asset = await uploadAdminImage(file, onUnauthorized); setDraft({ ...draft, imageAssetId: asset.imageAssetId, imageUrl: asset.imageUrl }); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(false); }
  }

  const listings = useMemo(() => [...(data?.listings ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.displayOrder - b.displayOrder), [data]);
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const set = (patch: Partial<Listing>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const packName = (id: string) => data.packs.find((p) => p.id === id)?.name ?? "없는 팩";

  return (
    <div className="ak-page">
      {error && <Notice tone="warn">{error}</Notice>}
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 상품</button>} count={`${listings.length}개 · 판매 중 ${listings.filter((l) => l.enabled && l.isSaleable !== false).length}개`}>
          {listings.map((l) => <ListRow key={l.id} thumb={l.imageUrl ?? l.pack?.imageUrl ?? null} selected={l.id === selectedId} onClick={() => select(l)} title={l.name} sub={`${packName(l.packDefinitionId)} ${l.quantity}개 · ${l.price.toLocaleString()} ${currency}`}
            badge={!l.enabled ? "판매 꺼짐" : l.packUnavailable ? "팩 문제" : l.isSaleable === false ? "기간 밖" : "판매 중"} tone={!l.enabled ? "off" : l.packUnavailable ? "danger" : l.isSaleable === false ? "warn" : "on"} />)}
          {!listings.length && <p className="ak-hint" style={{ margin: 8 }}>상품이 없어요. "+ 새 상품"을 눌러 보세요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />} right={draft && <><Button onClick={() => void duplicate()}>복제</Button><Button kind="danger" onClick={() => void remove()}>지우기</Button></>}
          empty="왼쪽에서 상품을 고르거나 새로 만들어 보세요. 팩 안에 무엇이 나오는지는 ‘카드팩’ 화면에서 정해요.">
          {draft && <>
            <Panel>
              <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label={draft.enabled ? "판매 중 (게임 상점에 보여요)" : "판매 꺼짐"} />
              {draft.packUnavailable && <Notice tone="error">연결된 카드팩이 공개 상태가 아니라서 팔리지 않아요. 다른 팩을 고르거나 팩을 공개해 주세요.</Notice>}
              <Grid>
                <Field label="상품 이름"><input value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="파는 카드팩"><select value={draft.packDefinitionId} onChange={(e) => set({ packDefinitionId: e.target.value })}>
                  {data.packs.filter((p) => !p.deletedAt && (p.status === "PUBLISHED" || p.id === draft.packDefinitionId)).map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== "PUBLISHED" ? " (미공개 — 못 팔아요)" : ""}</option>)}
                </select></Field>
                <Field label="한 번 살 때 팩 개수"><NumberInput value={draft.quantity} min={1} max={999} onChange={(quantity) => set({ quantity })} /></Field>
                <Field label={`가격 (${currency})`}><NumberInput value={draft.price} min={0} step={10} onChange={(price) => set({ price })} /></Field>
              </Grid>
              <Field label="설명"><textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            </Panel>
            <Panel title="그림" hint="비워 두면 카드팩 그림을 써요.">
              {(draft.imageUrl ?? data.packs.find((p) => p.id === draft.packDefinitionId)?.imageUrl) && <img className="ak-preview-img" src={draft.imageUrl ?? data.packs.find((p) => p.id === draft.packDefinitionId)?.imageUrl ?? ""} alt="" />}
              <div className="ak-row-actions"><ImagePick label="상품 그림 올리기" busy={uploading} onFile={(f) => void upload(f)} />{draft.imageAssetId && <Button kind="ghost" onClick={() => set({ imageAssetId: null, imageUrl: null })}>그림 빼기</Button>}</div>
            </Panel>
            <Panel title="판매 기간 · 순서" hint="기간을 비워 두면 계속 팔아요.">
              <Grid cols={3}>
                <Field label="시작"><input type="datetime-local" value={toLocalInput(draft.startsAt)} onChange={(e) => set({ startsAt: fromLocalInput(e.target.value) })} /></Field>
                <Field label="끝"><input type="datetime-local" value={toLocalInput(draft.endsAt)} onChange={(e) => set({ endsAt: fromLocalInput(e.target.value) })} /></Field>
                <Field label="보이는 순서" hint="작을수록 앞"><NumberInput value={draft.displayOrder} min={0} max={9999} onChange={(displayOrder) => set({ displayOrder })} /></Field>
              </Grid>
            </Panel>
          </>}
        </EditorPane>}
      />
    </div>
  );
}

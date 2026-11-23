import { packRateTotal, validPackRates } from "@workspace/cosmetics";
import { useEffect, useMemo, useState } from "react";
import { PackOpening } from "@/components/pack-opening";
import type { PackReward } from "@/lib/collection-client";
import {
  adminFetch, Button, Chip, EditorPane, errorText, Field, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel,
  SaveLine, Split, STATUS_KO, statusTone, Tabs, uploadAdminImage, useAutosave, useMobileEditing,
} from "./admin-kit";

type Pack = {
  id: string; name: string; description: string; imageUrl: string | null; imageAssetId?: string | null; cardsPerPack: number; starterRewardQuantity: number;
  normalRate: number; epicRate: number; legendaryRate: number; championRate: number; skinChance: number; emoteRate: number;
  normalCardPool: string[]; epicCardPool: string[]; legendaryCardPool: string[]; championPool: string[]; skinPool: string[]; emotePool: string[]; status: string;
};
type Option = { id: string; name: string; rarity?: string };
type SkinOption = Option & { cardName?: string };
type ForcedType = "NORMAL_CARD" | "EPIC_CARD" | "LEGENDARY_CARD" | "CHAMPION_UNLOCK" | "SKIN" | "IMAGE_EMOTE";
type PoolKey = "normalCardPool" | "epicCardPool" | "legendaryCardPool" | "championPool" | "skinPool" | "emotePool";
type RateKey = "normalRate" | "epicRate" | "legendaryRate" | "championRate" | "skinChance" | "emoteRate";

const SLOTS: Array<{ rate: RateKey; pool: PoolKey; label: string; forced: ForcedType }> = [
  { rate: "normalRate", pool: "normalCardPool", label: "일반 카드", forced: "NORMAL_CARD" },
  { rate: "epicRate", pool: "epicCardPool", label: "에픽 카드", forced: "EPIC_CARD" },
  { rate: "legendaryRate", pool: "legendaryCardPool", label: "레전더리 카드", forced: "LEGENDARY_CARD" },
  { rate: "championRate", pool: "championPool", label: "챔피언", forced: "CHAMPION_UNLOCK" },
  { rate: "skinChance", pool: "skinPool", label: "스킨", forced: "SKIN" },
  { rate: "emoteRate", pool: "emotePool", label: "이모티콘", forced: "IMAGE_EMOTE" },
];
const toInput = (p: Pack) => {
  const { id: _i, status: _s, ...rest } = p as Pack & Record<string, unknown>;
  const keep = ["name", "description", "imageUrl", "imageAssetId", "cardsPerPack", "starterRewardQuantity", ...SLOTS.flatMap((s) => [s.rate, s.pool])];
  return Object.fromEntries(Object.entries(rest).filter(([k]) => keep.includes(k)));
};

function PoolPicker({ options, selected, onChange }: { options: Option[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => !q.trim() || o.name.includes(q.trim()));
  return (
    <div className="ak-pool">
      <div className="ak-row-actions">
        <input className="ak-search" style={{ flex: 1, minWidth: 140 }} placeholder="이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button kind="ghost" onClick={() => onChange([...new Set([...selected, ...shown.map((o) => o.id)])])}>보이는 것 모두 넣기</Button>
        <Button kind="ghost" onClick={() => onChange(selected.filter((id) => !shown.some((o) => o.id === id)))}>모두 빼기</Button>
      </div>
      <div className="ak-chips" style={{ maxHeight: 180, overflowY: "auto" }}>
        {shown.map((o) => <Chip key={o.id} on={selected.includes(o.id)} onClick={() => onChange(selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id])}>{o.name}</Chip>)}
        {!options.length && <span className="ak-hint">고를 수 있는 것이 없어요.</span>}
      </div>
    </div>
  );
}

/** 카드팩 — 팩에서 무엇이 얼마나 나오는지 정해요. 고치면 바로 저장돼요. */
export function AdminPackManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [options, setOptions] = useState<{ cards: Option[]; champions: Option[]; skins: SkinOption[]; emotes: Option[] }>({ cards: [], champions: [], skins: [], emotes: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pack | null>(null);
  const [tab, setTab] = useState<"basic" | "rates" | "test">("basic");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PackReward[] | null>(null);
  const [forced, setForced] = useState<Array<{ type: ForcedType; id: string }> | null>(null);
  const mobile = useMobileEditing();

  async function load() {
    try {
      const [list, opts] = await Promise.all([
        adminFetch<{ packs: Pack[] }>("/packs", undefined, onUnauthorized),
        adminFetch<{ cards: Option[]; champions: Option[]; skins: SkinOption[]; emotes?: Option[] }>("/packs/options", undefined, onUnauthorized),
      ]);
      setPacks(list.packs); setOptions({ cards: opts.cards, champions: opts.champions, skins: opts.skins, emotes: opts.emotes ?? [] });
      return list.packs;
    } catch (e) { setError(errorText(e, "카드팩을 불러오지 못했어요.")); setPacks([]); return []; }
  }
  useEffect(() => { void load(); }, []);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    const body = await adminFetch<{ pack: Pack; validationErrors?: string[] }>(`/packs/${encodeURIComponent(next.id)}`, { method: "PATCH", json: toInput(next) }, onUnauthorized);
    setWarnings(body.validationErrors ?? []);
    setPacks((list) => list?.map((p) => (p.id === next.id ? { ...p, ...body.pack } : p)) ?? list);
  });

  function select(p: Pack) { void autosave.flush(); setSelectedId(p.id); setDraft({ ...p }); setWarnings([]); setForced(null); mobile.open(); }

  async function create() {
    try {
      const body = await adminFetch<{ pack: Pack }>("/packs", { method: "POST", json: { name: "새 카드팩", description: "", cardsPerPack: 5, starterRewardQuantity: 0, normalRate: 90, epicRate: 0, legendaryRate: 7, championRate: 3, skinChance: 0, emoteRate: 0, normalCardPool: [], epicCardPool: [], legendaryCardPool: [], championPool: [], skinPool: [], emotePool: [] } }, onUnauthorized);
      await load(); select(body.pack); setTab("basic");
    } catch (e) { setError(errorText(e, "카드팩을 만들지 못했어요.")); }
  }
  async function setStatus(status: "PUBLISHED" | "DRAFT" | "DISABLED") {
    if (!draft) return;
    await autosave.flush();
    try {
      const body = await adminFetch<{ pack: Pack }>(`/packs/${encodeURIComponent(draft.id)}/status`, { method: "POST", json: { status } }, onUnauthorized);
      const nextDraft = { ...draft, status: body.pack.status }; autosave.markSaved(nextDraft); setDraft(nextDraft); setPacks((list) => list?.map((p) => (p.id === draft.id ? { ...p, status: body.pack.status } : p)) ?? list);
      autosave.setState({ kind: "saved", message: `${STATUS_KO[body.pack.status] ?? body.pack.status}로 바꿨어요` });
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "상태를 바꾸지 못했어요.") }); }
  }
  async function duplicate() {
    if (!draft) return;
    try { const made = await adminFetch<{ pack: Pack }>(`/packs/${encodeURIComponent(draft.id)}/duplicate`, { method: "POST" }, onUnauthorized); const list = await load(); const copy = list.find((p) => p.id === made.pack.id); if (copy) select(copy); window.setTimeout(() => autosave.setState({ kind: "saved", message: "복제했어요 (미공개)" }), 50); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "복제하지 못했어요.") }); }
  }
  async function remove() {
    if (!draft || !window.confirm(`"${draft.name}" 카드팩을 지울까요?\n상점 상품이나 보상에 연결돼 있으면 지울 수 없어요.`)) return;
    try { await adminFetch(`/packs/${encodeURIComponent(draft.id)}`, { method: "DELETE" }, onUnauthorized); setDraft(null); setSelectedId(null); mobile.back(); await load(); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function upload(file: File) {
    if (!draft) return;
    setUploading(true);
    try { const asset = await uploadAdminImage(file, onUnauthorized); setDraft({ ...draft, imageAssetId: asset.imageAssetId, imageUrl: asset.imageUrl }); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(false); }
  }

  const sourceFor = (type: ForcedType): Option[] => type === "CHAMPION_UNLOCK" ? options.champions : type === "SKIN" ? options.skins : type === "IMAGE_EMOTE" ? options.emotes : options.cards;
  const poolFor = (type: ForcedType) => SLOTS.find((s) => s.forced === type)!.pool;
  async function runPreview() {
    if (!draft) return;
    await autosave.flush();
    try {
      const body = forced
        ? await adminFetch<{ rewards: PackReward[] }>(`/packs/${encodeURIComponent(draft.id)}/preview/forced`, { method: "POST", json: { slots: forced } }, onUnauthorized)
        : await adminFetch<{ rewards: PackReward[] }>(`/packs/${encodeURIComponent(draft.id)}/preview`, { method: "POST" }, onUnauthorized);
      setPreview(body.rewards);
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "미리 열어 보지 못했어요.") }); }
  }

  const list = useMemo(() => [...(packs ?? [])].sort((a, b) => (a.status === "PUBLISHED" ? 0 : 1) - (b.status === "PUBLISHED" ? 0 : 1) || a.name.localeCompare(b.name, "ko")), [packs]);
  if (!packs) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const set = (patch: Partial<Pack>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const total = draft ? packRateTotal(draft) : 0;
  const ratesOk = draft ? validPackRates(draft) : true;

  return (
    <div className="ak-page">
      {error && <Notice tone="error">{error}</Notice>}
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 카드팩</button>} count={`${list.length}개`}>
          {list.map((p) => <ListRow key={p.id} thumb={p.imageUrl} selected={p.id === selectedId} onClick={() => select(p)} title={p.name} sub={`한 팩에 ${p.cardsPerPack}장${p.starterRewardQuantity ? ` · 새 계정에 ${p.starterRewardQuantity}개` : ""}`} badge={STATUS_KO[p.status] ?? p.status} tone={statusTone(p.status)} />)}
          {!list.length && <p className="ak-hint" style={{ margin: 8 }}>카드팩이 없어요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />}
          right={draft && <>
            <div className="kst-status-switch" style={{ display: "flex", gap: 4 }}>{(["DRAFT", "PUBLISHED", "DISABLED"] as const).map((s) => <Chip key={s} on={draft.status === s} onClick={() => void setStatus(s)}>{STATUS_KO[s]}</Chip>)}</div>
            <Button onClick={() => void duplicate()}>복제</Button><Button kind="danger" onClick={() => void remove()}>지우기</Button>
          </>}>
          {draft && <>
            <Tabs<"basic" | "rates" | "test"> value={tab} onChange={setTab} tabs={[["basic", "기본"], ["rates", `나오는 것 · 확률${ratesOk ? "" : " ⚠"}`], ["test", "미리 열어 보기"]] as const} />
            {warnings.length > 0 && <Notice tone="warn">공개하려면 고쳐야 해요: {warnings.join(" ")}</Notice>}
            {tab === "basic" && <>
              <Panel>
                <Grid>
                  <Field label="카드팩 이름"><input value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Field>
                  <Field label="한 팩에 나오는 개수"><NumberInput value={draft.cardsPerPack} min={1} max={20} onChange={(cardsPerPack) => set({ cardsPerPack })} /></Field>
                </Grid>
                <Field label="설명"><textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
                <Field label="새로 가입한 계정에 주는 개수" hint="0이면 안 줘요. 여러 팩에 넣으면 팩마다 따로 줘요."><NumberInput value={draft.starterRewardQuantity} min={0} max={999} onChange={(starterRewardQuantity) => set({ starterRewardQuantity })} /></Field>
              </Panel>
              <Panel title="팩 그림">
                {draft.imageUrl && <img className="ak-preview-img" src={draft.imageUrl} alt="" />}
                <div className="ak-row-actions"><ImagePick label="팩 그림 올리기" busy={uploading} onFile={(f) => void upload(f)} />{draft.imageUrl && <Button kind="ghost" onClick={() => set({ imageAssetId: null, imageUrl: null })}>그림 빼기</Button>}</div>
              </Panel>
            </>}
            {tab === "rates" && <>
              <Notice tone={ratesOk ? "ok" : "warn"}>확률 합계 {total}% / 100% {ratesOk ? "· 딱 맞아요" : "· 합계를 100%로 맞춰 주세요"}<br /><small>한 장마다 한 번씩 뽑아요. 확률을 0이 아니게 넣은 칸은 아래에서 나올 것도 골라야 해요.</small></Notice>
              {SLOTS.map((slot) => {
                const opts = slot.pool === "normalCardPool" ? options.cards.filter((c) => c.rarity === "NORMAL") : slot.pool === "epicCardPool" ? options.cards.filter((c) => c.rarity === "EPIC") : slot.pool === "legendaryCardPool" ? options.cards.filter((c) => c.rarity === "LEGENDARY") : slot.pool === "championPool" ? options.champions : slot.pool === "skinPool" ? options.skins.map((s) => ({ ...s, name: s.cardName ? `${s.name} (${s.cardName})` : s.name })) : options.emotes;
                const rate = Number(draft[slot.rate] ?? 0), chosen = draft[slot.pool] ?? [];
                return (
                  <Panel key={slot.pool} title={`${slot.label} · ${rate}%`} right={<span className="ak-hint" style={{ margin: 0 }}>{chosen.length}개 골랐어요</span>}>
                    <Grid><Field label="나올 확률 (%)"><NumberInput value={rate} min={0} max={100} onChange={(v) => set({ [slot.rate]: v } as Partial<Pack>)} suffix="%" /></Field></Grid>
                    {rate > 0 && !chosen.length && <Notice tone="warn">확률이 있는데 나올 것이 하나도 없어요.</Notice>}
                    {(rate > 0 || chosen.length > 0) && <PoolPicker options={opts} selected={chosen} onChange={(ids) => set({ [slot.pool]: ids } as Partial<Pack>)} />}
                  </Panel>
                );
              })}
            </>}
            {tab === "test" && <Panel title="미리 열어 보기" hint="진짜 확률로 열어 봐요. 게이머 데이터는 안 바뀌어요.">
              <Tabs value={forced ? "forced" : "random"} onChange={(v) => setForced(v === "forced" ? Array.from({ length: draft.cardsPerPack }, () => { const first = SLOTS.find((s) => (draft[s.pool] ?? []).length); return { type: first?.forced ?? "NORMAL_CARD", id: first ? draft[first.pool][0]! : "" }; }) : null)} tabs={[["random", "진짜 확률로"], ["forced", "결과 직접 정하기"]] as const} />
              {forced?.map((slot, i) => (
                <Grid key={i}>
                  <Field label={`${i + 1}번째`}><select value={slot.type} onChange={(e) => { const type = e.target.value as ForcedType; setForced(forced.map((s, n) => (n === i ? { type, id: draft[poolFor(type)]?.[0] ?? "" } : s))); }}>{SLOTS.map((s) => <option key={s.forced} value={s.forced}>{s.label}</option>)}</select></Field>
                  <Field label="무엇이"><select value={slot.id} onChange={(e) => setForced(forced.map((s, n) => (n === i ? { ...s, id: e.target.value } : s)))}>{sourceFor(slot.type).filter((o) => (draft[poolFor(slot.type)] ?? []).includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                </Grid>
              ))}
              <div><Button kind="primary" onClick={() => void runPreview()}>열어 보기</Button></div>
            </Panel>}
          </>}
        </EditorPane>}
      />
      {preview && draft && <PackOpening packName={draft.name} rewards={preview} preview onClose={() => setPreview(null)} onRepeat={() => void runPreview()} onRegenerate={() => void runPreview()} />}
    </div>
  );
}

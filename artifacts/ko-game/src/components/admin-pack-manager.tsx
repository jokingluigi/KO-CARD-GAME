import { useEffect, useState } from "react";
import { Copy, Package, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { PackOpening } from "@/components/pack-opening";
import type { PackReward } from "@/lib/collection-client";

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/packs`;
type Pack = { id: string; name: string; description: string; imageUrl: string | null; cardsPerPack: number; starterRewardQuantity: number; normalRate: number; legendaryRate: number; championRate: number; skinChance: number; normalCardPool: string[]; legendaryCardPool: string[]; championPool: string[]; skinPool: string[]; status: string; };
type Option = { id: string; name: string; rarity?: string };
type SkinOption = Option & { cardDefinitionId: string; cardName: string; imageUrl: string | null };
type UserOption = { id: string; email: string; nickname: string; role: string };
type ForcedType = "NORMAL_CARD" | "LEGENDARY_CARD" | "CHAMPION_UNLOCK" | "SKIN";
type ForcedSlot = { type: ForcedType; id: string };
const blank: Omit<Pack, "id" | "status"> = { name: "", description: "", imageUrl: null, cardsPerPack: 1, starterRewardQuantity: 0, normalRate: 90, legendaryRate: 7, championRate: 3, skinChance: 0, normalCardPool: [], legendaryCardPool: [], championPool: [], skinPool: [] };
async function api<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청에 실패했습니다.");
  return body as T;
}
export function AdminPackManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [cards, setCards] = useState<Option[]>([]);
  const [champions, setChampions] = useState<Option[]>([]);
  const [skins, setSkins] = useState<SkinOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantQuantity, setGrantQuantity] = useState(1);
  const [selected, setSelected] = useState<Pack | null>(null);
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState("");
  const [testMode, setTestMode] = useState<"RANDOM" | "FORCED">("RANDOM");
  const [forcedSlots, setForcedSlots] = useState<ForcedSlot[]>([]);
  const [previewRewards, setPreviewRewards] = useState<PackReward[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  async function load() {
    try {
      const [list, options] = await Promise.all([api<{ packs: Pack[] }>(), api<{ cards: Option[]; champions: Option[]; skins: SkinOption[]; users: UserOption[] }>("/options")]);
      setPacks(list.packs); setCards(options.cards); setChampions(options.champions); setSkins(options.skins); setUsers(options.users);
    } catch (error) {
      if (error instanceof Error && error.message.includes("권한")) onUnauthorized();
      setStatus(error instanceof Error ? error.message : "불러오지 못했습니다.");
    }
  }
  useEffect(() => { void load(); }, []);
  function edit(pack: Pack) {
    setSelected(pack);
    setPreviewRewards(null);
    setForm({ name: pack.name, description: pack.description, imageUrl: pack.imageUrl, cardsPerPack: pack.cardsPerPack, starterRewardQuantity: pack.starterRewardQuantity ?? 0, normalRate: pack.normalRate, legendaryRate: pack.legendaryRate, championRate: pack.championRate, skinChance: pack.skinChance, normalCardPool: pack.normalCardPool, legendaryCardPool: pack.legendaryCardPool, championPool: pack.championPool, skinPool: pack.skinPool });
    setForcedSlots(createForcedSlots(pack));
  }
  async function save() {
    try {
      const result = await api<{ pack: Pack; validationErrors: string[] }>(selected ? `/${selected.id}` : "", { method: selected ? "PATCH" : "POST", body: JSON.stringify(form) });
      setStatus(result.validationErrors?.join(" ") || "저장했습니다."); setSelected(result.pack); setForcedSlots(createForcedSlots(result.pack)); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "저장하지 못했습니다."); }
  }
  async function action(path: string, init?: RequestInit) { try { await api(path, init); setStatus("처리했습니다."); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "처리하지 못했습니다."); } }
  async function grantPack() {
    if (!selected || !grantUserId) { setStatus("팩과 사용자를 선택해 주세요."); return; }
    await action(`/${selected.id}/grant`, { method: "POST", body: JSON.stringify({ userId: grantUserId, quantity: grantQuantity }) });
  }
  async function runPreview() {
    if (!selected) return;
    setPreviewing(true);
    try {
      const result = await api<{ rewards: PackReward[] }>(
        testMode === "RANDOM" ? `/${selected.id}/preview` : `/${selected.id}/preview/forced`,
        testMode === "RANDOM"
          ? { method: "POST" }
          : { method: "POST", body: JSON.stringify({ slots: forcedSlots }) },
      );
      setPreviewRewards(result.rewards);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "팩 개봉 테스트를 준비하지 못했습니다.");
    } finally {
      setPreviewing(false);
    }
  }
  function updateForcedSlot(index: number, type: ForcedType) {
    if (!selected) return;
    const nextOption = optionsForType(type, selected, cards, champions, skins)[0];
    setForcedSlots((current) => current.map((slot, slotIndex) => slotIndex === index
      ? { type, id: nextOption?.id ?? "" }
      : slot));
  }
  const toggle = (key: "normalCardPool" | "legendaryCardPool" | "championPool" | "skinPool", id: string) => setForm((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] }));
  return <section className="grid gap-5 lg:grid-cols-[260px_1fr]">
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-black">카드팩</h2><button type="button" onClick={() => { setSelected(null); setForm(blank); }} className="rounded bg-primary p-2 text-black"><Plus className="h-4 w-4" /></button></div>
      <div className="space-y-2">{packs.map((pack) => <button type="button" key={pack.id} onClick={() => edit(pack)} className={`w-full rounded border px-3 py-3 text-left ${selected?.id === pack.id ? "border-primary bg-primary/10" : "border-neutral-800"}`}><div className="font-bold">{pack.name}</div><div className="mt-1 text-xs text-neutral-500">{pack.status} · {pack.cardsPerPack}장 · 신규 계정 지급 {pack.starterRewardQuantity ?? 0}</div></button>)}</div>
    </div>
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-5">
      <div className="mb-5 flex items-center gap-3"><Package className="h-5 w-5 text-primary" /><div><h2 className="font-black">{selected ? "팩 수정" : "새 팩"}</h2><p className="text-xs text-neutral-500">확률 합계와 유효 Pool이 맞아야 PUBLISH할 수 있습니다.</p></div></div>
      {selected && <section className="mb-5 rounded-lg border border-amber-800/60 bg-amber-950/20 p-4"><h3 className="text-sm font-black text-amber-200">유저에게 팩 지급</h3><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]"><select value={grantUserId} onChange={(event) => setGrantUserId(event.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"><option value="">사용자 선택</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nickname} · {user.email}</option>)}</select><input type="number" min="1" max="999" value={grantQuantity} onChange={(event) => setGrantQuantity(Math.max(1, Number(event.target.value)))} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" /><button type="button" onClick={() => void grantPack()} className="rounded bg-amber-400 px-4 py-2 text-sm font-black text-black">지급</button></div></section>}
       <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">이름<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label><label className="text-sm font-bold">팩당 카드 수<input type="number" min="1" value={form.cardsPerPack} onChange={(e) => setForm({ ...form, cardsPerPack: Number(e.target.value) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label><label className="text-sm font-bold sm:col-span-2">설명<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 min-h-20 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label></div>
        <div className="mt-3 max-w-sm"><label className="text-sm font-bold">신규 계정 지급 수량<input type="number" min="0" max="999" value={form.starterRewardQuantity} onChange={(e) => setForm({ ...form, starterRewardQuantity: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /><span className="mt-1 block text-xs font-normal text-neutral-500">0이면 신규 계정 보상에서 제외됩니다. 여러 팩을 설정하면 각각 지급됩니다.</span></label></div>
       <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{(["normalRate", "legendaryRate", "championRate", "skinChance"] as const).map((key) => <label key={key} className="text-xs font-bold text-neutral-400">{key === "skinChance" ? "Skin Chance" : key.replace("Rate", " 확률")}<input type="number" min="0" max="100" value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-white" /></label>)}</div>
      <Pool title="NORMAL 카드 Pool" options={cards.filter((card) => card.rarity !== "LEGENDARY")} selected={form.normalCardPool} onToggle={(id) => toggle("normalCardPool", id)} />
      <Pool title="LEGENDARY 카드 Pool" options={cards.filter((card) => card.rarity === "LEGENDARY")} selected={form.legendaryCardPool} onToggle={(id) => toggle("legendaryCardPool", id)} />
      <Pool title="Champion Pool" options={champions} selected={form.championPool} onToggle={(id) => toggle("championPool", id)} />
       <Pool title="Skin Pool" options={skins} selected={form.skinPool} onToggle={(id) => toggle("skinPool", id)} />
      {status && <p className="mt-4 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{status}</p>}
       <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-black"><Save className="h-4 w-4" /> 저장</button>{selected && <><button type="button" onClick={() => void action(`/${selected.id}/status`, { method: "POST", body: JSON.stringify({ status: selected.status === "PUBLISHED" ? "DISABLED" : "PUBLISHED" }) })} className="rounded border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-300">{selected.status === "PUBLISHED" ? "DISABLE" : "PUBLISH"}</button><button type="button" onClick={() => void action(`/${selected.id}/duplicate`, { method: "POST" })} className="flex items-center gap-2 rounded border border-neutral-700 px-4 py-2 text-sm font-bold"><Copy className="h-4 w-4" /> 복제</button><button type="button" onClick={() => void action(`/${selected.id}`, { method: "DELETE" })} className="flex items-center gap-2 rounded border border-red-900 px-4 py-2 text-sm font-bold text-red-300"><Trash2 className="h-4 w-4" /> 삭제</button>{selected && <button type="button" onClick={() => void runPreview()} disabled={previewing} className="flex items-center gap-2 rounded border border-primary px-4 py-2 text-sm font-bold text-primary"><RotateCcw className="h-4 w-4" /> 팩 개봉 테스트</button>}</>}</div>
       {selected && <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">팩 개봉 테스트</h3><p className="mt-1 text-xs text-neutral-500">실제 팩/보상 데이터만 사용하며 사용자 데이터는 변경하지 않습니다.</p></div><div className="flex gap-2"><button type="button" onClick={() => setTestMode("RANDOM")} className={`rounded px-3 py-2 text-xs font-black ${testMode === "RANDOM" ? "bg-primary text-black" : "border border-neutral-700 text-neutral-300"}`}>실제 확률 랜덤</button><button type="button" onClick={() => setTestMode("FORCED")} className={`rounded px-3 py-2 text-xs font-black ${testMode === "FORCED" ? "bg-primary text-black" : "border border-neutral-700 text-neutral-300"}`}>결과 강제 지정</button></div></div>{testMode === "FORCED" && <div className="mt-4 space-y-2">{forcedSlots.map((slot, index) => <div key={index} className="grid gap-2 sm:grid-cols-[140px_1fr]"><select value={slot.type} onChange={(event) => updateForcedSlot(index, event.target.value as ForcedType)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"><option value="NORMAL_CARD">NORMAL</option><option value="LEGENDARY_CARD">LEGENDARY</option><option value="CHAMPION_UNLOCK">CHAMPION</option><option value="SKIN">SKIN</option></select><select value={slot.id} onChange={(event) => setForcedSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, id: event.target.value } : item))} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">{optionsForType(slot.type, selected, cards, champions, skins).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>)}</div>}<button type="button" onClick={() => void runPreview()} disabled={previewing} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-black text-black disabled:opacity-50">{previewing ? "준비 중..." : "테스트 시작"}</button></section>}
       {previewRewards && selected && <PackOpening packName={selected.name} rewards={previewRewards} preview onClose={() => setPreviewRewards(null)} onRepeat={() => void runPreview()} onRegenerate={() => void runPreview()} />}
    </div>
  </section>;
}
function createForcedSlots(pack: Pack): ForcedSlot[] {
  const defaults: Array<[ForcedType, string[]]> = [
    ["NORMAL_CARD", pack.normalCardPool],
    ["LEGENDARY_CARD", pack.legendaryCardPool],
    ["CHAMPION_UNLOCK", pack.championPool],
    ["SKIN", pack.skinPool],
  ];
  const firstAvailable = defaults.find(([, ids]) => ids.length > 0);
  return Array.from({ length: pack.cardsPerPack }, () => ({
    type: firstAvailable?.[0] ?? "NORMAL_CARD",
    id: firstAvailable?.[1][0] ?? "",
  }));
}

function optionsForType(type: ForcedType, pack: Pack, cards: Option[], champions: Option[], skins: SkinOption[]): Option[] {
  const ids = type === "NORMAL_CARD"
    ? pack.normalCardPool
    : type === "LEGENDARY_CARD"
      ? pack.legendaryCardPool
      : type === "CHAMPION_UNLOCK"
        ? pack.championPool
        : pack.skinPool;
  const source = type === "NORMAL_CARD" || type === "LEGENDARY_CARD" ? cards : type === "CHAMPION_UNLOCK" ? champions : skins;
  return source.filter((option) => ids.includes(option.id));
}

function Pool({ title, options, selected, onToggle }: { title: string; options: Option[]; selected: string[]; onToggle: (id: string) => void }) {
  return <fieldset className="mt-5"><legend className="mb-2 text-sm font-black">{title} <span className="text-xs font-normal text-neutral-500">({selected.length})</span></legend><div className="grid max-h-40 gap-2 overflow-y-auto rounded border border-neutral-800 p-3 sm:grid-cols-2">{options.map((option) => <label key={option.id} className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} />{option.name}</label>)}</div></fieldset>;
}
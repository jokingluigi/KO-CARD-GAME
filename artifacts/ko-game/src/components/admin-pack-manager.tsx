import { useEffect, useState } from "react";
import { Copy, Package, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/packs`;
type Pack = { id: string; name: string; description: string; cardsPerPack: number; normalRate: number; legendaryRate: number; championRate: number; normalCardPool: string[]; legendaryCardPool: string[]; championPool: string[]; status: string; };
type Option = { id: string; name: string; rarity?: string };
const blank: Omit<Pack, "id" | "status"> = { name: "", description: "", cardsPerPack: 1, normalRate: 90, legendaryRate: 7, championRate: 3, normalCardPool: [], legendaryCardPool: [], championPool: [] };
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
  const [selected, setSelected] = useState<Pack | null>(null);
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState("");
  async function load() {
    try {
      const [list, options] = await Promise.all([api<{ packs: Pack[] }>(), api<{ cards: Option[]; champions: Option[] }>("/options")]);
      setPacks(list.packs); setCards(options.cards); setChampions(options.champions);
    } catch (error) {
      if (error instanceof Error && error.message.includes("권한")) onUnauthorized();
      setStatus(error instanceof Error ? error.message : "불러오지 못했습니다.");
    }
  }
  useEffect(() => { void load(); }, []);
  function edit(pack: Pack) { setSelected(pack); setForm({ name: pack.name, description: pack.description, cardsPerPack: pack.cardsPerPack, normalRate: pack.normalRate, legendaryRate: pack.legendaryRate, championRate: pack.championRate, normalCardPool: pack.normalCardPool, legendaryCardPool: pack.legendaryCardPool, championPool: pack.championPool }); }
  async function save() {
    try {
      const result = await api<{ pack: Pack; validationErrors: string[] }>(selected ? `/${selected.id}` : "", { method: selected ? "PATCH" : "POST", body: JSON.stringify(form) });
      setStatus(result.validationErrors?.join(" ") || "저장했습니다."); setSelected(result.pack); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "저장하지 못했습니다."); }
  }
  async function action(path: string, init?: RequestInit) { try { await api(path, init); setStatus("처리했습니다."); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "처리하지 못했습니다."); } }
  const toggle = (key: "normalCardPool" | "legendaryCardPool" | "championPool", id: string) => setForm((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id] }));
  return <section className="grid gap-5 lg:grid-cols-[260px_1fr]">
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-black">카드팩</h2><button type="button" onClick={() => { setSelected(null); setForm(blank); }} className="rounded bg-primary p-2 text-black"><Plus className="h-4 w-4" /></button></div>
      <div className="space-y-2">{packs.map((pack) => <button type="button" key={pack.id} onClick={() => edit(pack)} className={`w-full rounded border px-3 py-3 text-left ${selected?.id === pack.id ? "border-primary bg-primary/10" : "border-neutral-800"}`}><div className="font-bold">{pack.name}</div><div className="mt-1 text-xs text-neutral-500">{pack.status} · {pack.cardsPerPack}장</div></button>)}</div>
    </div>
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-5">
      <div className="mb-5 flex items-center gap-3"><Package className="h-5 w-5 text-primary" /><div><h2 className="font-black">{selected ? "팩 수정" : "새 팩"}</h2><p className="text-xs text-neutral-500">확률 합계와 유효 Pool이 맞아야 PUBLISH할 수 있습니다.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">이름<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label><label className="text-sm font-bold">팩당 카드 수<input type="number" min="1" value={form.cardsPerPack} onChange={(e) => setForm({ ...form, cardsPerPack: Number(e.target.value) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label><label className="text-sm font-bold sm:col-span-2">설명<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 min-h-20 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" /></label></div>
      <div className="mt-4 grid grid-cols-3 gap-3">{(["normalRate", "legendaryRate", "championRate"] as const).map((key) => <label key={key} className="text-xs font-bold text-neutral-400">{key.replace("Rate", " 확률")}<input type="number" min="0" max="100" value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-white" /></label>)}</div>
      <Pool title="NORMAL 카드 Pool" options={cards.filter((card) => card.rarity !== "LEGENDARY")} selected={form.normalCardPool} onToggle={(id) => toggle("normalCardPool", id)} />
      <Pool title="LEGENDARY 카드 Pool" options={cards.filter((card) => card.rarity === "LEGENDARY")} selected={form.legendaryCardPool} onToggle={(id) => toggle("legendaryCardPool", id)} />
      <Pool title="Champion Pool" options={champions} selected={form.championPool} onToggle={(id) => toggle("championPool", id)} />
      {status && <p className="mt-4 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{status}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-black"><Save className="h-4 w-4" /> 저장</button>{selected && <><button type="button" onClick={() => void action(`/${selected.id}/status`, { method: "POST", body: JSON.stringify({ status: selected.status === "PUBLISHED" ? "DISABLED" : "PUBLISHED" }) })} className="rounded border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-300">{selected.status === "PUBLISHED" ? "DISABLE" : "PUBLISH"}</button><button type="button" onClick={() => void action(`/${selected.id}/duplicate`, { method: "POST" })} className="flex items-center gap-2 rounded border border-neutral-700 px-4 py-2 text-sm font-bold"><Copy className="h-4 w-4" /> 복제</button><button type="button" onClick={() => void action(`/${selected.id}`, { method: "DELETE" })} className="flex items-center gap-2 rounded border border-red-900 px-4 py-2 text-sm font-bold text-red-300"><Trash2 className="h-4 w-4" /> 삭제</button><button type="button" onClick={() => void action(`/${selected.id}/preview`, { method: "POST" })} className="flex items-center gap-2 rounded border border-neutral-700 px-4 py-2 text-sm font-bold"><RotateCcw className="h-4 w-4" /> Preview Opening</button></>}</div>
    </div>
  </section>;
}
function Pool({ title, options, selected, onToggle }: { title: string; options: Option[]; selected: string[]; onToggle: (id: string) => void }) {
  return <fieldset className="mt-5"><legend className="mb-2 text-sm font-black">{title} <span className="text-xs font-normal text-neutral-500">({selected.length})</span></legend><div className="grid max-h-40 gap-2 overflow-y-auto rounded border border-neutral-800 p-3 sm:grid-cols-2">{options.map((option) => <label key={option.id} className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} />{option.name}</label>)}</div></fieldset>;
}
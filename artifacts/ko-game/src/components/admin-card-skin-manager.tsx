import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/card-skins`;
type CardOption = { id: string; name: string };
type Skin = { id: string; cardDefinitionId: string; cardName: string; name: string; description: string; imageUrl: string | null; status: string };
type Form = { cardDefinitionId: string; name: string; description: string; imageUrl: string };
const blank: Form = { cardDefinitionId: "", name: "", description: "", imageUrl: "" };

async function api<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body as T;
}

export function AdminCardSkinManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [selected, setSelected] = useState<Skin | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const result = await api<{ skins: Skin[]; cards: CardOption[] }>();
      setSkins(result.skins);
      setCards(result.cards);
    } catch (error) {
      if (error instanceof Error && error.message.includes("권한")) onUnauthorized();
      setMessage(error instanceof Error ? error.message : "Skin을 불러오지 못했습니다.");
    }
  }
  useEffect(() => { void load(); }, []);

  function edit(skin: Skin) {
    setSelected(skin);
    setForm({ cardDefinitionId: skin.cardDefinitionId, name: skin.name, description: skin.description, imageUrl: skin.imageUrl ?? "" });
  }

  async function save() {
    try {
      const result = await api<{ skin: Skin }>(selected ? `/${selected.id}` : "", { method: selected ? "PATCH" : "POST", body: JSON.stringify(form) });
      setSelected(result.skin);
      setMessage("Skin을 저장했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Skin을 저장하지 못했습니다.");
    }
  }

  async function action(path: string, init?: RequestInit) {
    try {
      await api(path, init);
      setMessage("처리했습니다.");
      setSelected(null);
      setForm(blank);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리하지 못했습니다.");
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-black">Card Skins</h2><button type="button" onClick={() => { setSelected(null); setForm(blank); }} className="rounded bg-primary p-2 text-black"><Plus className="h-4 w-4" /></button></div>
        <div className="space-y-2">{skins.map((skin) => <button type="button" key={skin.id} onClick={() => edit(skin)} className={`w-full rounded border px-3 py-3 text-left ${selected?.id === skin.id ? "border-primary bg-primary/10" : "border-neutral-800"}`}><div className="font-bold">{skin.name}</div><div className="mt-1 text-xs text-neutral-500">{skin.cardName} · {skin.status}</div></button>)}</div>
      </div>
      <div className="rounded-xl border border-neutral-800 bg-black/30 p-5">
        <h2 className="text-xl font-black">{selected ? "Skin 수정" : "새 Skin"}</h2>
        <p className="mt-2 text-sm text-neutral-500">공개된 일반 카드에 연결된 Skin만 팩 Pool에 추가할 수 있습니다.</p>
        <div className="mt-5 grid gap-3">
          <label className="text-sm font-bold">기본 카드<select value={form.cardDefinitionId} onChange={(event) => setForm({ ...form, cardDefinitionId: event.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5"><option value="">카드 선택</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
          <label className="text-sm font-bold">Skin 이름<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
          <label className="text-sm font-bold">이미지 URL<input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
          <label className="text-sm font-bold">설명<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 min-h-24 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5" /></label>
        </div>
        {message && <p role="status" className="mt-4 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200">{message}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-black"><Save className="h-4 w-4" /> 저장</button>{selected && <><button type="button" onClick={() => void action(`/${selected.id}/status`, { method: "POST", body: JSON.stringify({ status: selected.status === "PUBLISHED" ? "DISABLED" : "PUBLISHED" }) })} className="rounded border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-300">{selected.status === "PUBLISHED" ? "DISABLE" : "PUBLISH"}</button><button type="button" onClick={() => void action(`/${selected.id}`, { method: "DELETE" })} className="flex items-center gap-2 rounded border border-red-900 px-4 py-2 text-sm font-bold text-red-300"><Trash2 className="h-4 w-4" /> 삭제</button></>}</div>
      </div>
    </section>
  );
}
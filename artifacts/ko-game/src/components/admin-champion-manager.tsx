import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Copy, FilePenLine, Plus, Search, X } from "lucide-react";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
type Status = "DRAFT" | "PUBLISHED" | "DISABLED";
type Champion = {
  id: string; name: string; description: string; imageUrl: string | null; imageAssetId: string | null;
  maxHealth: number; abilityName: string; abilityCost: number; abilityText: string;
  abilityEffects: Record<string, unknown>; hasQuest: boolean; questName: string | null;
  questText: string | null; questCondition: Record<string, unknown> | null;
  questProgressRequired: number | null; questRewardText: string | null;
  questRewardEffects: Record<string, unknown> | null; upgradedAbilityName: string | null;
  upgradedAbilityCost: number | null; upgradedAbilityText: string | null;
  upgradedAbilityEffects: Record<string, unknown> | null; championTokenDefinitionId: string | null;
  abilityAudioAssetId: string | null; abilityAudioUrl: string | null; abilityAudioVolume: number;
  status: Status; version: number;
};
type Form = Omit<Champion, "id" | "status" | "version">;
const empty: Form = {
  name: "", description: "", imageUrl: null, imageAssetId: null, maxHealth: 20,
  abilityName: "", abilityCost: 0, abilityText: "", abilityEffects: {},
  hasQuest: false, questName: null, questText: null, questCondition: null,
  questProgressRequired: null, questRewardText: null, questRewardEffects: null,
  upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null,
  upgradedAbilityEffects: null, championTokenDefinitionId: null,
  abilityAudioAssetId: null, abilityAudioUrl: null, abilityAudioVolume: 100,
};

async function message(response: Response) {
  try { return ((await response.json()) as { message?: string }).message ?? "요청을 처리하지 못했습니다."; }
  catch { return "요청을 처리하지 못했습니다."; }
}

export function AdminChampionManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Champion | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("status", status);
    const response = await fetch(`${adminApiBase}/champions?${query}`, { credentials: "include" });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setError(await message(response)); return; }
    setChampions(((await response.json()) as { champions: Champion[] }).champions);
  }, [onUnauthorized, search, status]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => clearTimeout(timer); }, [load]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function analyze(textKey: "abilityText" | "questRewardText" | "upgradedAbilityText",
    effectsKey: "abilityEffects" | "questRewardEffects" | "upgradedAbilityEffects") {
    const text = form[textKey]?.trim();
    if (!text) { setError("분석할 자연어 효과를 입력해 주세요."); return; }
    const response = await fetch(`${adminApiBase}/effects/analyze`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.status === 401) { onUnauthorized(); return; }
    const result = await response.json() as { outcome?: string; effects?: unknown[]; unsupportedSegments?: string[]; message?: string };
    if (!response.ok || result.outcome !== "supported") {
      setError(result.outcome === "mechanism_required"
        ? `새 메커니즘이 필요합니다: ${(result.unsupportedSegments ?? []).join(", ")}`
        : result.message ?? "효과 의도를 충분히 이해하지 못했습니다.");
      return;
    }
    update(effectsKey, { effects: result.effects ?? [] } as Form[typeof effectsKey]);
    setError("");
  }
  async function analyzeQuest() {
    const text = form.questText?.trim();
    if (!text) { setError("분석할 퀘스트 조건을 입력해 주세요."); return; }
    const response = await fetch(`${adminApiBase}/quests/analyze`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.status === 401) { onUnauthorized(); return; }
    const result = await response.json() as { outcome?: string; condition?: Record<string, unknown>; unsupportedParts?: string[] };
    if (!response.ok || result.outcome !== "supported" || !result.condition) {
      setError(`새 메커니즘이 필요합니다: ${(result.unsupportedParts ?? [text]).join(", ")}`); return;
    }
    update("questCondition", result.condition);
    if (typeof result.condition.required === "number") update("questProgressRequired", result.condition.required);
    setError("");
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `${adminApiBase}/champions/${editing.id}` : `${adminApiBase}/champions`, {
        method: editing ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await message(response));
      setOpen(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "챔피언을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function mutate(id: string, action: "duplicate" | "status", body?: object) {
    const response = await fetch(`${adminApiBase}/champions/${id}/${action}`, {
      method: "POST", credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setError(await message(response)); return; }
    await load();
  }
  function editor(champion?: Champion) {
    setEditing(champion ?? null); setForm(champion ? {
      name: champion.name, description: champion.description, imageUrl: champion.imageUrl,
      imageAssetId: champion.imageAssetId, maxHealth: champion.maxHealth, abilityName: champion.abilityName,
      abilityCost: champion.abilityCost, abilityText: champion.abilityText, abilityEffects: champion.abilityEffects,
      hasQuest: champion.hasQuest, questName: champion.questName, questText: champion.questText,
      questCondition: champion.questCondition, questProgressRequired: champion.questProgressRequired,
      questRewardText: champion.questRewardText, questRewardEffects: champion.questRewardEffects,
      upgradedAbilityName: champion.upgradedAbilityName, upgradedAbilityCost: champion.upgradedAbilityCost,
      upgradedAbilityText: champion.upgradedAbilityText, upgradedAbilityEffects: champion.upgradedAbilityEffects,
      championTokenDefinitionId: champion.championTokenDefinitionId, abilityAudioAssetId: champion.abilityAudioAssetId,
      abilityAudioUrl: champion.abilityAudioUrl, abilityAudioVolume: champion.abilityAudioVolume,
    } : empty); setOpen(true); setError("");
  }
  const input = "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm";
  return <div>
    <div className="mb-5 flex items-end justify-between">
      <div><div className="text-[10px] font-bold tracking-[.2em] text-neutral-600">CONTENT MANAGEMENT</div>
        <h2 className="mt-1 text-xl font-black">챔피언 관리</h2>
        <p className="mt-1 text-xs text-neutral-500">새 챔피언은 DRAFT로 저장되며 기본 최대 체력은 20입니다.</p></div>
      <button onClick={() => editor()} className="flex gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black"><Plus className="h-4 w-4"/> 새 챔피언</button>
    </div>
    {error && <div className="mb-4 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
    <div className="mb-4 flex gap-2"><label className="flex flex-1 items-center gap-2 rounded border border-neutral-800 px-3"><Search className="h-4 w-4"/><input value={search} onChange={(e)=>setSearch(e.target.value)} className="w-full bg-transparent py-2 outline-none" placeholder="챔피언 검색"/></label>
      <select value={status} onChange={(e)=>setStatus(e.target.value)} className={input}><option value="">모든 상태</option><option>DRAFT</option><option>PUBLISHED</option><option>DISABLED</option></select></div>
    <div className="grid gap-3 md:grid-cols-2">{champions.map((champion)=><article key={champion.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex gap-4">{champion.imageUrl ? <img src={champion.imageUrl} alt="" className="h-24 w-20 rounded object-cover"/> : <div className="h-24 w-20 rounded bg-neutral-900"/>}
        <div><div className="text-xs text-primary">{champion.status} · v{champion.version}</div><h3 className="text-lg font-black">{champion.name}</h3><p className="text-xs text-neutral-400">HP {champion.maxHealth} · {champion.abilityCost}G</p><p className="mt-1 text-sm">{champion.abilityName}</p>{champion.hasQuest && <p className="mt-1 text-xs text-amber-300">Quest: {champion.questName} (0/{champion.questProgressRequired})</p>}</div></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><button onClick={()=>editor(champion)} className="rounded border px-2 py-1"><FilePenLine className="mr-1 inline h-3 w-3"/>수정</button><button onClick={()=>void mutate(champion.id,"duplicate")} className="rounded border px-2 py-1"><Copy className="mr-1 inline h-3 w-3"/>복제</button>{champion.status!=="PUBLISHED"&&<button onClick={()=>void mutate(champion.id,"status",{status:"PUBLISHED"})} className="rounded border border-emerald-800 px-2 py-1 text-emerald-400"><CheckCircle2 className="mr-1 inline h-3 w-3"/>공개</button>}{champion.status!=="DISABLED"&&<button onClick={()=>void mutate(champion.id,"status",{status:"DISABLED"})} className="rounded border border-red-900 px-2 py-1 text-red-400"><Ban className="mr-1 inline h-3 w-3"/>비활성화</button>}</div>
    </article>)}</div>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5"><div className="mx-auto max-w-4xl rounded-lg border border-neutral-700 bg-neutral-950 p-5">
      <div className="mb-4 flex justify-between"><h3 className="text-xl font-black">{editing?"챔피언 수정":"새 챔피언"}</h3><button onClick={()=>setOpen(false)}><X/></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>이름<input className={input} value={form.name} onChange={e=>update("name",e.target.value)}/></label>
        <label>최대 HP<input type="number" className={input} value={form.maxHealth} onChange={e=>update("maxHealth",Number(e.target.value))}/></label>
        <label className="md:col-span-2">설명<textarea className={input} value={form.description} onChange={e=>update("description",e.target.value)}/></label>
        <label>고유 능력 이름<input className={input} value={form.abilityName} onChange={e=>update("abilityName",e.target.value)}/></label>
        <label>Gold 비용<input type="number" className={input} value={form.abilityCost} onChange={e=>update("abilityCost",Number(e.target.value))}/></label>
        <EffectField title="고유 능력 효과" value={form.abilityText} onChange={v=>update("abilityText",v)} onAnalyze={()=>void analyze("abilityText","abilityEffects")} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.hasQuest} onChange={e=>update("hasQuest",e.target.checked)}/> 퀘스트 있음</label>
        {form.hasQuest && <><label>퀘스트 이름<input className={input} value={form.questName??""} onChange={e=>update("questName",e.target.value)}/></label><label>필요 진행도<input type="number" className={input} value={form.questProgressRequired??1} onChange={e=>update("questProgressRequired",Number(e.target.value))}/></label>
          <label className="md:col-span-2">퀘스트 조건<textarea className={input} value={form.questText??""} onChange={e=>update("questText",e.target.value)}/><button type="button" onClick={()=>void analyzeQuest()} className="mt-2 rounded border border-primary px-3 py-1.5 text-xs font-bold text-primary">퀘스트 조건 분석</button></label>
          <EffectField title="퀘스트 보상" value={form.questRewardText??""} onChange={v=>update("questRewardText",v)} onAnalyze={()=>void analyze("questRewardText","questRewardEffects")} /></>}
        <label>강화 능력 이름<input className={input} value={form.upgradedAbilityName??""} onChange={e=>update("upgradedAbilityName",e.target.value||null)}/></label>
        <label>강화 능력 비용<input type="number" className={input} value={form.upgradedAbilityCost??""} onChange={e=>update("upgradedAbilityCost",e.target.value===""?null:Number(e.target.value))}/></label>
        <EffectField title="강화 고유 능력" value={form.upgradedAbilityText??""} onChange={v=>update("upgradedAbilityText",v)} onAnalyze={()=>void analyze("upgradedAbilityText","upgradedAbilityEffects")} />
        <label>Champion Token 카드 ID<input className={input} value={form.championTokenDefinitionId??""} onChange={e=>update("championTokenDefinitionId",e.target.value||null)}/></label>
      </div><div className="mt-5 flex justify-end"><button disabled={busy} onClick={()=>void save()} className="rounded bg-primary px-5 py-2.5 font-black text-black">DRAFT 저장</button></div>
    </div></div>}
  </div>;
}

function EffectField({ title, value, onChange, onAnalyze }: { title:string; value:string; onChange:(v:string)=>void; onAnalyze:()=>void }) {
  return <label className="md:col-span-2">{title}<textarea className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" value={value} onChange={e=>onChange(e.target.value)}/><button type="button" onClick={onAnalyze} className="mt-2 rounded border border-primary px-3 py-1.5 text-xs font-bold text-primary">효과 분석</button></label>;
}
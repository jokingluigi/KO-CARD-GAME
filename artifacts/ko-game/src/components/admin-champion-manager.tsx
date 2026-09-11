import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Copy, FilePenLine, Plus, Search, Trash2, X } from "lucide-react";
import { AdminAudioField } from "./admin-audio-field";
import { useToast } from "../hooks/use-toast";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
type Status = "DRAFT" | "PUBLISHED" | "DISABLED";
type TokenCard = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  cost: number;
  attack: number;
  health: number;
  text: string;
  imageUrl: string | null;
  status: Status;
  isChampionToken: boolean;
};
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
  questCompleteAudioAssetId: string | null; questCompleteAudioUrl: string | null;
  questCompleteAudioVolume: number; questCompleteAudioEnabled: boolean;
  questCompleteAudioUploadToken: string | null;
  questCompleteAudioFileName: string | null;
  status: Status; version: number;
};
type Form = Omit<Champion, "id" | "status" | "version">;
type EffectAnalysisKey = "abilityText" | "questRewardText" | "upgradedAbilityText";
type EffectSlot = "ABILITY" | "QUEST_REWARD" | "UPGRADED_ABILITY";
type EffectAnalysis = {
  status?: "success" | "partial" | "failure";
  outcome?: "supported" | "mechanism_required" | "analysis_failure";
  effects?: unknown[];
  condition?: Record<string, unknown>;
  summaries?: string[];
  unsupportedSegments?: string[];
  unsupportedParts?: string[];
  reason?: string;
  message?: string;
};
const empty: Form = {
  name: "", description: "", imageUrl: null, imageAssetId: null, maxHealth: 20,
  abilityName: "", abilityCost: 0, abilityText: "", abilityEffects: {},
  hasQuest: false, questName: null, questText: null, questCondition: null,
  questProgressRequired: null, questRewardText: null, questRewardEffects: null,
  upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null,
  upgradedAbilityEffects: null, championTokenDefinitionId: null,
  abilityAudioAssetId: null, abilityAudioUrl: null, abilityAudioVolume: 100,
  questCompleteAudioAssetId: null, questCompleteAudioUrl: null,
  questCompleteAudioVolume: 100, questCompleteAudioEnabled: false,
  questCompleteAudioUploadToken: null,
  questCompleteAudioFileName: null,
};

async function message(response: Response) {
  try { return ((await response.json()) as { message?: string }).message ?? "요청을 처리하지 못했습니다."; }
  catch { return "요청을 처리하지 못했습니다."; }
}

export function AdminChampionManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { toast } = useToast();
  const [champions, setChampions] = useState<Champion[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Champion | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzingKey, setAnalyzingKey] = useState<(EffectAnalysisKey | "questText") | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Partial<Record<EffectAnalysisKey, EffectAnalysis>>>({});
  const [questAnalysis, setQuestAnalysis] = useState<EffectAnalysis | null>(null);
  const [prompts, setPrompts] = useState<Partial<Record<EffectAnalysisKey | "questText", string>>>({});
  const [promptingKey, setPromptingKey] = useState<EffectAnalysisKey | "questText" | null>(null);
  const [tokenCards, setTokenCards] = useState<TokenCard[]>([]);
  const [tokenSearch, setTokenSearch] = useState("");
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
  const loadTokenCards = useCallback(async () => {
    const response = await fetch(`${adminApiBase}/cards?tokenKind=CHAMPION_TOKEN`, { credentials: "include" });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setError(await message(response)); return; }
    setTokenCards(((await response.json()) as { cards: TokenCard[] }).cards);
  }, [onUnauthorized]);
  useEffect(() => { void loadTokenCards(); }, [loadTokenCards]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function analyze(textKey: EffectAnalysisKey, effectSlot: EffectSlot) {
    const text = form[textKey]?.trim();
    if (!text) { setError("분석할 자연어 효과를 입력해 주세요."); return; }
    setError("");
    setAnalyzingKey(textKey);
    try {
      const response = await fetch(`${adminApiBase}/effects/analyze`, {
        method: "POST", credentials: "include", cache: "no-store",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ text, effectContext: effectSlot === "ABILITY"
           ? "CHAMPION_ABILITY"
           : effectSlot === "UPGRADED_ABILITY"
             ? "UPGRADED_CHAMPION_ABILITY"
            : "QUEST_REWARD" }),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      const result = await response.json() as EffectAnalysis;
      setAnalysisResults((current) => ({ ...current, [textKey]: result }));
      setPrompts((current) => ({ ...current, [textKey]: undefined }));
      if (!response.ok || result.outcome !== "supported") {
        setError(result.outcome === "mechanism_required"
          ? `새 메커니즘이 필요합니다: ${(result.unsupportedParts ?? result.unsupportedSegments ?? []).join(", ")}`
          : result.message ?? result.reason ?? "효과 의도를 충분히 이해하지 못했습니다.");
        return;
      }
      setMessageText("효과 분석이 완료되었습니다. 결과를 확인한 뒤 효과 적용을 눌러 저장할 수 있습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "효과를 분석하지 못했습니다.");
    } finally {
      setAnalyzingKey(null);
    }
  }

  function applyEffect(textKey: EffectAnalysisKey,
    effectsKey: "abilityEffects" | "questRewardEffects" | "upgradedAbilityEffects") {
    const analysis = analysisResults[textKey];
    if (!analysis || analysis.outcome !== "supported") return;
    update(effectsKey, { effects: analysis.effects ?? [] } as Form[typeof effectsKey]);
    setMessageText("분석 결과를 효과 슬롯에 적용했습니다. 챔피언 저장을 눌러 보존하세요.");
    setError("");
  }

  async function generatePrompt(textKey: EffectAnalysisKey | "questText", effectContext: string) {
    const text = form[textKey]?.trim();
    if (!text) { setError("프롬프트를 만들 자연어 효과를 입력해 주세요."); return; }
    setPromptingKey(textKey);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}/effects/replit-prompt`, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, effectContext, championName: form.name }),
      });
      const body = await response.json() as { prompt?: string; analysis?: EffectAnalysis; message?: string };
      if (response.status === 401) { onUnauthorized(); return; }
      if (body.analysis) {
        if (textKey === "questText") setQuestAnalysis(body.analysis);
        else setAnalysisResults((current) => ({ ...current, [textKey]: body.analysis }));
      }
      if (!response.ok || !body.prompt) throw new Error(body.message ?? "프롬프트를 만들지 못했습니다.");
      setPrompts((current) => ({ ...current, [textKey]: body.prompt }));
      setMessageText("Replit 구현 프롬프트를 만들었습니다. 아래에서 확인하고 복사할 수 있습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프롬프트를 만들지 못했습니다.");
    } finally {
      setPromptingKey(null);
    }
  }

  async function copyPrompt(textKey: EffectAnalysisKey | "questText") {
    const prompt = prompts[textKey];
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: "Replit Agent용 프롬프트를 복사했습니다." });
    } catch {
      toast({ title: "프롬프트를 복사하지 못했습니다.", variant: "destructive" });
    }
  }

  async function analyzeQuest() {
    const text = form.questText?.trim();
    if (!text) { setError("분석할 퀘스트 조건을 입력해 주세요."); return; }
    setError("");
    setAnalyzingKey("questText");
    try {
      const response = await fetch(`${adminApiBase}/effects/analyze`, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, effectContext: "QUEST_CONDITION" }),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      const result = await response.json() as EffectAnalysis;
      setQuestAnalysis(result);
      setPrompts((current) => ({ ...current, questText: undefined }));
      if (result.outcome === "supported") {
        setMessageText("퀘스트 조건 분석이 완료되었습니다. 결과를 확인한 뒤 조건 적용을 눌러 저장할 수 있습니다.");
      } else {
        setError(result.outcome === "mechanism_required"
          ? `새 메커니즘이 필요합니다: ${(result.unsupportedParts ?? result.unsupportedSegments ?? []).join(", ")}`
          : result.reason ?? "퀘스트 조건을 이해하지 못했습니다.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "퀘스트 조건을 분석하지 못했습니다.");
    } finally {
      setAnalyzingKey(null);
    }
  }

  function applyQuestAnalysis() {
    if (!questAnalysis?.condition || questAnalysis.outcome !== "supported") return;
    update("questCondition", questAnalysis.condition);
    if (typeof questAnalysis.condition.required === "number") {
      update("questProgressRequired", questAnalysis.condition.required);
    }
    setMessageText("퀘스트 조건 분석 결과를 적용했습니다. 챔피언 저장을 눌러 보존하세요.");
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
       setMessageText(editing ? "챔피언을 수정했습니다." : "새 챔피언을 DRAFT로 저장했습니다.");
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
  async function deleteChampion(champion: Champion) {
    if (!window.confirm(`"${champion.name}" 챔피언을 삭제하시겠습니까?\n삭제한 챔피언은 복구할 수 없습니다.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}/champions/${champion.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await message(response));
      setMessageText(`"${champion.name}" 챔피언을 삭제했습니다.`);
      if (editing?.id === champion.id) setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "챔피언을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const visibleTokenCards = tokenCards.filter((card) =>
    !tokenSearch.trim() || card.name.toLowerCase().includes(tokenSearch.trim().toLowerCase()),
  );
  const selectedTokenCard = tokenCards.find((card) => card.id === form.championTokenDefinitionId);
   function editor(champion?: Champion) {
     setAnalysisResults({});
      setQuestAnalysis(null);
      setPrompts({});
     setAnalyzingKey(null);
     setEditing(champion ?? null); setTokenSearch(""); setForm(champion ? {
      name: champion.name, description: champion.description, imageUrl: champion.imageUrl,
      imageAssetId: champion.imageAssetId, maxHealth: champion.maxHealth, abilityName: champion.abilityName,
      abilityCost: champion.abilityCost, abilityText: champion.abilityText, abilityEffects: champion.abilityEffects,
      hasQuest: champion.hasQuest, questName: champion.questName, questText: champion.questText,
      questCondition: champion.questCondition, questProgressRequired: champion.questProgressRequired,
      questRewardText: champion.questRewardText, questRewardEffects: champion.questRewardEffects,
      upgradedAbilityName: champion.upgradedAbilityName, upgradedAbilityCost: champion.upgradedAbilityCost,
      upgradedAbilityText: champion.upgradedAbilityText, upgradedAbilityEffects: champion.upgradedAbilityEffects,
       championTokenDefinitionId: champion.championTokenDefinitionId,
       abilityAudioAssetId: champion.abilityAudioAssetId,
      abilityAudioUrl: champion.abilityAudioUrl, abilityAudioVolume: champion.abilityAudioVolume,
      questCompleteAudioAssetId: champion.questCompleteAudioAssetId,
      questCompleteAudioUrl: champion.questCompleteAudioUrl,
      questCompleteAudioVolume: champion.questCompleteAudioVolume ?? 100,
      questCompleteAudioEnabled: champion.questCompleteAudioEnabled ?? false,
      questCompleteAudioUploadToken: null,
      questCompleteAudioFileName: null,
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
    {messageText && <div className="mb-4 rounded border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{messageText}</div>}
    <div className="mb-4 flex gap-2"><label className="flex flex-1 items-center gap-2 rounded border border-neutral-800 px-3"><Search className="h-4 w-4"/><input value={search} onChange={(e)=>setSearch(e.target.value)} className="w-full bg-transparent py-2 outline-none" placeholder="챔피언 검색"/></label>
      <select value={status} onChange={(e)=>setStatus(e.target.value)} className={input}><option value="">모든 상태</option><option>DRAFT</option><option>PUBLISHED</option><option>DISABLED</option></select></div>
     <div className="grid gap-3 md:grid-cols-2">{champions.map((champion)=><article key={champion.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex gap-4">{champion.imageUrl ? <img src={champion.imageUrl} alt="" className="h-24 w-20 rounded object-cover"/> : <div className="h-24 w-20 rounded bg-neutral-900"/>}
        <div><div className="text-xs text-primary">{champion.status} · v{champion.version}</div><h3 className="text-lg font-black">{champion.name}</h3><p className="text-xs text-neutral-400">HP {champion.maxHealth} · {champion.abilityCost}G</p><p className="mt-1 text-sm">{champion.abilityName}</p>{champion.hasQuest && <p className="mt-1 text-xs text-amber-300">Quest: {champion.questName} (0/{champion.questProgressRequired})</p>}</div></div>
       <div className="mt-3 flex flex-wrap gap-2 text-xs"><button type="button" onClick={()=>editor(champion)} className="rounded border px-2 py-1"><FilePenLine className="mr-1 inline h-3 w-3"/>수정</button><button type="button" onClick={()=>void mutate(champion.id,"duplicate")} className="rounded border px-2 py-1"><Copy className="mr-1 inline h-3 w-3"/>복제</button><button type="button" disabled={busy} onClick={()=>void deleteChampion(champion)} data-testid={`button-delete-champion-${champion.id}`} className="rounded border border-red-900 px-2 py-1 text-red-400 disabled:opacity-40"><Trash2 className="mr-1 inline h-3 w-3"/>삭제</button>{champion.status!=="PUBLISHED"&&<button type="button" onClick={()=>void mutate(champion.id,"status",{status:"PUBLISHED"})} className="rounded border border-emerald-800 px-2 py-1 text-emerald-400"><CheckCircle2 className="mr-1 inline h-3 w-3"/>공개</button>}{champion.status!=="DISABLED"&&<button type="button" onClick={()=>void mutate(champion.id,"status",{status:"DISABLED"})} className="rounded border border-red-900 px-2 py-1 text-red-400"><Ban className="mr-1 inline h-3 w-3"/>비활성화</button>}</div>
    </article>)}</div>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5"><div className="mx-auto max-w-4xl rounded-lg border border-neutral-700 bg-neutral-950 p-5">
      <div className="mb-4 flex justify-between"><h3 className="text-xl font-black">{editing?"챔피언 수정":"새 챔피언"}</h3><button onClick={()=>setOpen(false)}><X/></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label>이름<input className={input} value={form.name} onChange={e=>update("name",e.target.value)}/></label>
        <label>최대 HP<input type="number" className={input} value={form.maxHealth} onChange={e=>update("maxHealth",Number(e.target.value))}/></label>
        <label className="md:col-span-2">설명<textarea className={input} value={form.description} onChange={e=>update("description",e.target.value)}/></label>
        <label>고유 능력 이름<input className={input} value={form.abilityName} onChange={e=>update("abilityName",e.target.value)}/></label>
        <label>Gold 비용<input type="number" className={input} value={form.abilityCost} onChange={e=>update("abilityCost",Number(e.target.value))}/></label>
          <EffectField
            title="고유 능력 효과"
            value={form.abilityText}
            onChange={v=>update("abilityText",v)}
            onAnalyze={()=>void analyze("abilityText","ABILITY")}
            onApply={()=>applyEffect("abilityText","abilityEffects")}
            onPrompt={()=>void generatePrompt("abilityText","CHAMPION_ABILITY")}
            onReanalyze={()=>void analyze("abilityText","ABILITY")}
            analysis={analysisResults.abilityText}
            prompt={prompts.abilityText}
            onCopyPrompt={()=>void copyPrompt("abilityText")}
            analyzing={analyzingKey === "abilityText"}
            prompting={promptingKey === "abilityText"}
          />
         <label className="flex items-center gap-2"><input type="checkbox" checked={form.hasQuest} onChange={e=>setForm((current) => ({
           ...current,
           hasQuest: e.target.checked,
           questProgressRequired: e.target.checked ? (current.questProgressRequired ?? 1) : null,
         }))}/> 퀘스트 있음</label>
        {form.hasQuest && <><label>퀘스트 이름<input className={input} value={form.questName??""} onChange={e=>update("questName",e.target.value)}/></label><label>필요 진행도<input type="number" className={input} value={form.questProgressRequired??1} onChange={e=>update("questProgressRequired",Number(e.target.value))}/></label>
           <QuestConditionField
             value={form.questText??""}
             onChange={v=>update("questText",v)}
             onAnalyze={()=>void analyzeQuest()}
             onApply={applyQuestAnalysis}
             onPrompt={()=>void generatePrompt("questText","QUEST_CONDITION")}
             onReanalyze={()=>void analyzeQuest()}
             analysis={questAnalysis}
             prompt={prompts.questText}
             onCopyPrompt={()=>void copyPrompt("questText")}
             analyzing={analyzingKey === "questText"}
             prompting={promptingKey === "questText"}
           />
             <EffectField
               title="퀘스트 보상"
               value={form.questRewardText??""}
               onChange={v=>update("questRewardText",v)}
               onAnalyze={()=>void analyze("questRewardText","QUEST_REWARD")}
               onApply={()=>applyEffect("questRewardText","questRewardEffects")}
               onPrompt={()=>void generatePrompt("questRewardText","QUEST_REWARD")}
               onReanalyze={()=>void analyze("questRewardText","QUEST_REWARD")}
               analysis={analysisResults.questRewardText}
               prompt={prompts.questRewardText}
               onCopyPrompt={()=>void copyPrompt("questRewardText")}
               analyzing={analyzingKey === "questRewardText"}
               prompting={promptingKey === "questRewardText"}
             /></>}
        <label>강화 능력 이름<input className={input} value={form.upgradedAbilityName??""} onChange={e=>update("upgradedAbilityName",e.target.value||null)}/></label>
        <label>강화 능력 비용<input type="number" className={input} value={form.upgradedAbilityCost??""} onChange={e=>update("upgradedAbilityCost",e.target.value===""?null:Number(e.target.value))}/></label>
           <EffectField
             title="강화 고유 능력"
             value={form.upgradedAbilityText??""}
             onChange={v=>update("upgradedAbilityText",v)}
             onAnalyze={()=>void analyze("upgradedAbilityText","UPGRADED_ABILITY")}
             onApply={()=>applyEffect("upgradedAbilityText","upgradedAbilityEffects")}
             onPrompt={()=>void generatePrompt("upgradedAbilityText","UPGRADED_CHAMPION_ABILITY")}
             onReanalyze={()=>void analyze("upgradedAbilityText","UPGRADED_ABILITY")}
             analysis={analysisResults.upgradedAbilityText}
             prompt={prompts.upgradedAbilityText}
             onCopyPrompt={()=>void copyPrompt("upgradedAbilityText")}
             analyzing={analyzingKey === "upgradedAbilityText"}
             prompting={promptingKey === "upgradedAbilityText"}
           />
         <div className="md:col-span-2 rounded border border-neutral-800 bg-neutral-900/40 p-3">
           <div className="mb-2 text-xs font-bold text-neutral-400">연결할 Champion Token</div>
           <input
             className={input}
             value={tokenSearch}
             onChange={e=>setTokenSearch(e.target.value)}
             placeholder="Champion Token 카드 검색"
             aria-label="Champion Token 카드 검색"
           />
           <select
             className={`${input} mt-2`}
             value={form.championTokenDefinitionId ?? ""}
             onChange={e=>update("championTokenDefinitionId", e.target.value || null)}
             aria-label="연결할 Champion Token"
           >
             <option value="">연결하지 않음</option>
             {visibleTokenCards.map((card) => (
               <option key={card.id} value={card.id}>
                 {card.name} · {card.cost}G · {card.attack}/{card.health} · {card.status}
               </option>
             ))}
           </select>
           {selectedTokenCard ? (
             <div className="mt-3 flex items-center gap-3 rounded border border-primary/30 bg-black/30 p-3">
               {selectedTokenCard.imageUrl
                 ? <img src={selectedTokenCard.imageUrl} alt="" className="h-16 w-12 rounded object-cover" />
                 : <div className="h-16 w-12 rounded bg-neutral-800" />}
               <div className="min-w-0 text-xs">
                 <div className="font-black text-primary">{selectedTokenCard.name}</div>
                 <div className="mt-1 text-neutral-300">{selectedTokenCard.cost}G · {selectedTokenCard.attack}/{selectedTokenCard.health}</div>
                 <div className="mt-1 text-neutral-500">Champion Token · {selectedTokenCard.status}</div>
                 <div className="mt-2 text-neutral-400">카드 이름·스탯·효과·이미지는 선수 카드 관리자에서 편집합니다.</div>
               </div>
             </div>
           ) : form.championTokenDefinitionId ? (
             <div className="mt-3 rounded border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200">
               연결된 Champion Token 카드를 찾을 수 없습니다. 삭제되었거나 Champion Token이 아닌 카드일 수 있습니다.
             </div>
           ) : (
             <div className="mt-2 text-xs text-neutral-500">Card Admin에서 `챔피언 토큰`으로 만든 카드만 선택할 수 있습니다.</div>
           )}
           {selectedTokenCard?.status === "DISABLED" && (
             <div className="mt-2 rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-200">
               이 카드는 비활성 상태입니다. Champion을 공개하려면 Card Admin에서 먼저 공개 가능한 상태로 바꾸세요.
             </div>
           )}
         </div>
         <AdminAudioField
           title="챔피언 퀘스트 완료 음악"
           value={{
             assetId: form.questCompleteAudioAssetId,
             url: form.questCompleteAudioUrl,
             volume: form.questCompleteAudioVolume,
             enabled: form.questCompleteAudioEnabled,
             uploadToken: form.questCompleteAudioUploadToken,
             fileName: form.questCompleteAudioFileName,
           }}
           onChange={(value) => {
             update("questCompleteAudioAssetId", value.assetId);
             update("questCompleteAudioUrl", value.url);
             update("questCompleteAudioVolume", value.volume);
             update("questCompleteAudioEnabled", value.enabled);
             update("questCompleteAudioUploadToken", value.uploadToken);
             update("questCompleteAudioFileName", value.fileName);
           }}
           onError={(messageText) => {
             setError(messageText);
             if (messageText) toast({ title: "음악 업로드 실패", description: messageText, variant: "destructive" });
           }}
           onMessage={(messageText) => {
             setError("");
             setMessageText(messageText);
           }}
         />
      </div><div className="mt-5 flex justify-end"><button disabled={busy} onClick={()=>void save()} className="rounded bg-primary px-5 py-2.5 font-black text-black">DRAFT 저장</button></div>
    </div></div>}
  </div>;
}

type AnalysisControlsProps = {
  analysis?: EffectAnalysis | null;
  onApply: () => void;
  applyLabel: string;
  onPrompt: () => void;
  onReanalyze: () => void;
  prompt?: string;
  onCopyPrompt: () => void;
  analyzing?: boolean;
  prompting?: boolean;
};

function AnalysisControls({
  analysis,
  onApply,
  applyLabel,
  onPrompt,
  onReanalyze,
  prompt,
  onCopyPrompt,
  analyzing,
  prompting,
}: AnalysisControlsProps) {
  if (!analysis) return null;
  const supported = analysis.outcome === "supported";
  return <div className={`mt-2 rounded border p-3 text-xs ${supported ? "border-emerald-800 bg-emerald-950/30" : "border-amber-800 bg-amber-950/30"}`}>
    <strong>{supported ? "✓ SUPPORTED" : analysis.outcome === "mechanism_required" ? "⚠ NEW_MECHANIC_REQUIRED" : "⚠ ANALYSIS_FAILED"}</strong>
    {analysis.summaries && analysis.summaries.length > 0 && <div className="mt-2"><div className="font-bold text-neutral-300">분석 결과</div><ul className="mt-1 list-disc pl-4 text-neutral-200">{analysis.summaries.map((summary) => <li key={summary}>{summary}</li>)}</ul></div>}
    {analysis.reason && <p className="mt-1 text-neutral-300">{analysis.reason}</p>}
    {(analysis.unsupportedParts ?? analysis.unsupportedSegments)?.length ? <p className="mt-1 text-amber-200">unsupportedParts: {(analysis.unsupportedParts ?? analysis.unsupportedSegments ?? []).join(", ")}</p> : null}
    {supported && <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-relaxed">{JSON.stringify(analysis.condition ? { condition: analysis.condition } : { effects: analysis.effects ?? [] }, null, 2)}</pre>}
    <div className="mt-3 flex flex-wrap gap-2">
      {supported && <button type="button" onClick={onApply} className="rounded bg-primary px-3 py-1.5 font-bold text-black">{applyLabel}</button>}
      {!supported && <button type="button" disabled={prompting} onClick={onPrompt} className="rounded border border-amber-700 px-3 py-1.5 font-bold text-amber-300 disabled:opacity-50">{prompting ? "프롬프트 생성 중..." : "Replit 구현 프롬프트 생성"}</button>}
      <button type="button" disabled={analyzing} onClick={onReanalyze} className="rounded border border-emerald-700 px-3 py-1.5 font-bold text-emerald-300 disabled:opacity-50">{analyzing ? "다시 분석 중..." : "구현 완료 - 다시 분석"}</button>
    </div>
    {prompt && <div className="mt-3"><textarea readOnly value={prompt} className="min-h-48 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-[10px] leading-relaxed"/><button type="button" onClick={onCopyPrompt} className="mt-2 rounded border border-neutral-600 px-3 py-1.5">프롬프트 복사</button></div>}
  </div>;
}

function EffectField({ title, value, onChange, onAnalyze, onApply, onPrompt, onReanalyze, analysis, prompt, onCopyPrompt, analyzing, prompting }: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onApply: () => void;
  onPrompt: () => void;
  onReanalyze: () => void;
  analysis?: EffectAnalysis | null;
  prompt?: string;
  onCopyPrompt: () => void;
  analyzing?: boolean;
  prompting?: boolean;
}) {
  return <label className="md:col-span-2">
    {title}
    <textarea className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" value={value} onChange={e=>onChange(e.target.value)}/>
    <button type="button" onClick={onAnalyze} disabled={analyzing} className="mt-2 rounded border border-primary px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">
      {analyzing ? "분석 중..." : "효과 분석"}
    </button>
    <AnalysisControls
      analysis={analysis}
      onApply={onApply}
      applyLabel="효과 적용"
      onPrompt={onPrompt}
      onReanalyze={onReanalyze}
      prompt={prompt}
      onCopyPrompt={onCopyPrompt}
      analyzing={analyzing}
      prompting={prompting}
    />
  </label>;
}

function QuestConditionField({ value, onChange, onAnalyze, onApply, onPrompt, onReanalyze, analysis, prompt, onCopyPrompt, analyzing, prompting }: {
  value: string;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onApply: () => void;
  onPrompt: () => void;
  onReanalyze: () => void;
  analysis?: EffectAnalysis | null;
  prompt?: string;
  onCopyPrompt: () => void;
  analyzing?: boolean;
  prompting?: boolean;
}) {
  return <label className="md:col-span-2">
    퀘스트 조건
    <textarea className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm" value={value} onChange={e=>onChange(e.target.value)}/>
    <button type="button" onClick={onAnalyze} disabled={analyzing} className="mt-2 rounded border border-primary px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">
      {analyzing ? "분석 중..." : "퀘스트 조건 분석"}
    </button>
    <AnalysisControls
      analysis={analysis}
      onApply={onApply}
      applyLabel="조건 적용"
      onPrompt={onPrompt}
      onReanalyze={onReanalyze}
      prompt={prompt}
      onCopyPrompt={onCopyPrompt}
      analyzing={analyzing}
      prompting={prompting}
    />
  </label>;
}
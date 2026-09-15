import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Ban, CheckCircle2, Copy, FilePenLine, ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
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
   isStarterGrant?: boolean;
};
type Champion = {
  id: string; name: string; description: string; imageUrl: string | null; imageAssetId: string | null;
  imageUploadToken: string | null;
  imageFileName: string | null;
  questCompletedPortraitEnabled: boolean;
  questCompletedPortraitAssetId: string | null; questCompletedPortraitUrl: string | null;
  questCompletedPortraitUploadToken: string | null;
  questCompletedPortraitFileName: string | null;
  maxHealth: number; abilityName: string; abilityCost: number; abilityText: string;
  abilityEffects: Record<string, unknown>; hasQuest: boolean; questName: string | null;
  questText: string | null; questCondition: Record<string, unknown> | null;
  questProgressRequired: number | null; questRewardText: string | null;
  questRewardEffects: Record<string, unknown> | null; upgradedAbilityName: string | null;
  upgradedAbilityCost: number | null; upgradedAbilityText: string | null;
  upgradedAbilityEffects: Record<string, unknown> | null; championTokenDefinitionId: string | null;
   isStarterGrant: boolean;
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
type FullSection = {
  key: string;
  label: string;
  status: "SUPPORTED" | "NEW_MECHANIC_REQUIRED" | "ANALYSIS_FAILED";
  sourceText?: string;
  analysis?: EffectAnalysis;
  note?: string;
};
type FullAnalysis = {
  sections: FullSection[];
  unsupportedParts: string[];
  fullySupported: boolean;
  token?: { id: string; name: string; attack: number; health: number; text: string; status: Status };
  tokenReferenceError?: string;
};
const empty: Form = {
  name: "", description: "", imageUrl: null, imageAssetId: null, imageUploadToken: null, imageFileName: null, maxHealth: 20,
  questCompletedPortraitEnabled: false, questCompletedPortraitAssetId: null, questCompletedPortraitUrl: null,
  questCompletedPortraitUploadToken: null, questCompletedPortraitFileName: null,
  abilityName: "", abilityCost: 0, abilityText: "", abilityEffects: {},
  hasQuest: false, questName: null, questText: null, questCondition: null,
  questProgressRequired: null, questRewardText: null, questRewardEffects: null,
  upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null,
  upgradedAbilityEffects: null, championTokenDefinitionId: null,
   isStarterGrant: false,
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
  const [fullAnalysis, setFullAnalysis] = useState<FullAnalysis | null>(null);
  const [fullPrompt, setFullPrompt] = useState("");
  const [fullPrompting, setFullPrompting] = useState(false);
  const [fullAnalyzing, setFullAnalyzing] = useState(false);
  const [tokenCards, setTokenCards] = useState<TokenCard[]>([]);
  const [tokenSearch, setTokenSearch] = useState("");
  const basicPortraitInputRef = useRef<HTMLInputElement>(null);
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const [basicPortraitLocalUrl, setBasicPortraitLocalUrl] = useState<string | null>(null);
  const [portraitLocalUrl, setPortraitLocalUrl] = useState<string | null>(null);
  const [basicPortraitUploading, setBasicPortraitUploading] = useState(false);
  const [portraitUploading, setPortraitUploading] = useState(false);
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

  async function runFullChampionAnalysis(withPrompt: boolean) {
    setError("");
    if (withPrompt) setFullPrompting(true);
    else setFullAnalyzing(true);
    try {
      const response = await fetch(`${adminApiBase}/champions/${withPrompt ? "full-prompt" : "full-analyze"}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      const body = await response.json() as { analysis?: FullAnalysis; prompt?: string; message?: string };
      if (!response.ok || !body.analysis) throw new Error(body.message ?? "Champion 전체 분석에 실패했습니다.");
      setFullAnalysis(body.analysis);
      if (withPrompt) {
        setFullPrompt(body.prompt ?? "");
        setMessageText("Champion 전체 구현 프롬프트를 생성했습니다.");
      } else {
        setFullPrompt("");
        setMessageText(body.analysis.fullySupported
          ? "CHAMPION FULLY SUPPORTED: 최신 Registry 기준으로 모든 영역이 지원됩니다."
          : "최신 Effect Registry 기준으로 Champion 전체를 다시 분석했습니다.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Champion 전체 분석에 실패했습니다.");
    } finally {
      if (withPrompt) setFullPrompting(false);
      else setFullAnalyzing(false);
    }
  }

  async function copyFullPrompt() {
    if (!fullPrompt) return;
    try {
      await navigator.clipboard.writeText(fullPrompt);
      toast({ title: "Champion 전체 구현 프롬프트를 복사했습니다." });
    } catch {
      toast({ title: "Champion 전체 프롬프트를 복사하지 못했습니다.", variant: "destructive" });
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
    setForm((current) => ({
      ...current,
      questCondition: questAnalysis.condition ?? null,
      questProgressRequired: typeof questAnalysis.condition?.required === "number"
        ? questAnalysis.condition.required
        : current.questProgressRequired,
    }));
    setMessageText("퀘스트 조건 분석 결과를 적용했습니다. 챔피언 저장을 눌러 보존하세요.");
    setError("");
  }
  function updateQuestProgress(value: number | null) {
    setForm((current) => ({
      ...current,
      questProgressRequired: value,
      questCondition: current.questCondition && value !== null
        ? { ...current.questCondition, required: value }
        : current.questCondition,
    }));
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
      setFullAnalysis(null);
      setFullPrompt("");
     setAnalyzingKey(null);
      setEditing(champion ?? null); setTokenSearch(""); setBasicPortraitLocalUrl(null); setPortraitLocalUrl(null); setForm(champion ? {
       name: champion.name, description: champion.description, imageUrl: champion.imageUrl,
       imageAssetId: champion.imageAssetId, imageUploadToken: null, imageFileName: null, maxHealth: champion.maxHealth, abilityName: champion.abilityName,
       questCompletedPortraitEnabled: champion.questCompletedPortraitEnabled ?? false,
       questCompletedPortraitAssetId: champion.questCompletedPortraitAssetId ?? null,
       questCompletedPortraitUrl: champion.questCompletedPortraitUrl ?? null,
       questCompletedPortraitUploadToken: null,
       questCompletedPortraitFileName: null,
      abilityCost: champion.abilityCost, abilityText: champion.abilityText, abilityEffects: champion.abilityEffects,
      hasQuest: champion.hasQuest, questName: champion.questName, questText: champion.questText,
      questCondition: champion.questCondition, questProgressRequired: champion.questProgressRequired,
      questRewardText: champion.questRewardText, questRewardEffects: champion.questRewardEffects,
      upgradedAbilityName: champion.upgradedAbilityName, upgradedAbilityCost: champion.upgradedAbilityCost,
      upgradedAbilityText: champion.upgradedAbilityText, upgradedAbilityEffects: champion.upgradedAbilityEffects,
       championTokenDefinitionId: champion.championTokenDefinitionId,
        isStarterGrant: champion.isStarterGrant ?? false,
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

    async function discardPendingImage(imageAssetId: string | null, imageUploadToken: string | null) {
      if (!imageAssetId || !imageUploadToken) return;
     await fetch(`${adminApiBase}/cards/images/discard`, {
       method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
          imageAssetId,
          imageUploadToken,
       }),
     });
   }

    async function discardPendingBasicPortrait() {
      await discardPendingImage(form.imageAssetId, form.imageUploadToken);
    }

    async function discardPendingCompletedPortrait() {
      await discardPendingImage(form.questCompletedPortraitAssetId, form.questCompletedPortraitUploadToken);
    }

    function clearLocalUrl(setter: Dispatch<SetStateAction<string | null>>) {
      setter((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return null;
      });
    }

    function clearPortraitLocalUrl() {
      clearLocalUrl(setPortraitLocalUrl);
    }

    function clearBasicPortraitLocalUrl() {
      clearLocalUrl(setBasicPortraitLocalUrl);
    }

    function removeBasicPortrait() {
      void discardPendingBasicPortrait();
      clearBasicPortraitLocalUrl();
      update("imageAssetId", null);
      update("imageUrl", null);
      update("imageUploadToken", null);
      update("imageFileName", null);
      if (basicPortraitInputRef.current) basicPortraitInputRef.current.value = "";
    }

    function removePortrait() {
      void discardPendingCompletedPortrait();
      clearPortraitLocalUrl();
      update("questCompletedPortraitAssetId", null);
      update("questCompletedPortraitUrl", null);
      update("questCompletedPortraitUploadToken", null);
      update("questCompletedPortraitFileName", null);
      if (portraitInputRef.current) portraitInputRef.current.value = "";
    }

    async function uploadPortrait(file: File, kind: "basic" | "completed") {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const allowed = (file.type === "image/png" && extension === "png") ||
        (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
        (file.type === "image/webp" && extension === "webp");
      if (!allowed) {
        setError("PNG, JPG, JPEG, WEBP 이미지 파일만 선택할 수 있습니다.");
        return;
      }
      const setLocalUrl = kind === "basic" ? setBasicPortraitLocalUrl : setPortraitLocalUrl;
      const setUploading = kind === "basic" ? setBasicPortraitUploading : setPortraitUploading;
      const discardPending = kind === "basic" ? discardPendingBasicPortrait : discardPendingCompletedPortrait;
      await discardPending();
      clearLocalUrl(setLocalUrl);
      const localUrl = URL.createObjectURL(file);
      setLocalUrl(localUrl);
      setUploading(true);
      setError("");
      try {
        const requestResponse = await fetch(`${adminApiBase}/cards/images/upload-url`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (requestResponse.status === 401) { onUnauthorized(); return; }
        if (!requestResponse.ok) throw new Error(await message(requestResponse));
        const upload = await requestResponse.json() as { uploadURL: string; objectPath: string };
        const uploadResponse = await fetch(upload.uploadURL, {
          method: "PUT", headers: { "Content-Type": file.type }, body: file,
        });
        if (!uploadResponse.ok) throw new Error("초상화 파일 업로드에 실패했습니다.");
        const completeResponse = await fetch(`${adminApiBase}/cards/images/complete`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath: upload.objectPath, contentType: file.type }),
        });
        if (completeResponse.status === 401) { onUnauthorized(); return; }
        if (!completeResponse.ok) throw new Error(await message(completeResponse));
        const asset = await completeResponse.json() as {
          imageAssetId: string; imageUrl: string; imageUploadToken: string;
        };
        if (kind === "basic") {
          update("imageAssetId", asset.imageAssetId);
          update("imageUrl", asset.imageUrl);
          update("imageUploadToken", asset.imageUploadToken);
          update("imageFileName", file.name);
          setMessageText("기본 초상화를 업로드했습니다. 저장하면 적용됩니다.");
        } else {
          update("questCompletedPortraitAssetId", asset.imageAssetId);
          update("questCompletedPortraitUrl", asset.imageUrl);
          update("questCompletedPortraitUploadToken", asset.imageUploadToken);
          update("questCompletedPortraitFileName", file.name);
          update("questCompletedPortraitEnabled", true);
          setMessageText("퀘스트 완료 초상화를 업로드했습니다. 저장하면 적용됩니다.");
        }
      } catch (reason) {
        clearLocalUrl(setLocalUrl);
        setError(reason instanceof Error ? reason.message : "초상화를 업로드하지 못했습니다.");
      } finally {
        setUploading(false);
      }
    }

    function closeEditor() {
      void discardPendingBasicPortrait();
      void discardPendingCompletedPortrait();
      clearBasicPortraitLocalUrl();
      clearPortraitLocalUrl();
      setOpen(false);
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
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{editing?"챔피언 수정":"새 챔피언"}</h3><p className="mt-1 text-xs text-neutral-500">분석과 프롬프트 생성은 현재 입력값을 별도 상태로 처리하며 폼을 초기화하지 않습니다.</p></div><button type="button" onClick={closeEditor}><X/></button></div>
       <div className="mb-4 flex flex-wrap gap-2 rounded border border-neutral-800 bg-neutral-900/40 p-3">
         <button type="button" disabled={fullPrompting} onClick={()=>void runFullChampionAnalysis(true)} className="rounded bg-primary px-3 py-2 text-xs font-black text-black disabled:opacity-50">
           {fullPrompting ? "전체 프롬프트 생성 중..." : "챔피언 전체 구현 프롬프트 생성"}
         </button>
         <button type="button" disabled={fullAnalyzing} onClick={()=>void runFullChampionAnalysis(false)} className="rounded border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-300 disabled:opacity-50">
           {fullAnalyzing ? "전체 다시 분석 중..." : "전체 구현 완료 - 다시 분석"}
         </button>
       </div>
       <FullAnalysisPanel analysis={fullAnalysis} prompt={fullPrompt} onCopyPrompt={()=>void copyFullPrompt()} />
      <div className="grid gap-4 md:grid-cols-2">
        <label>이름<input className={input} value={form.name} onChange={e=>update("name",e.target.value)}/></label>
        <label>최대 HP<input type="number" className={input} value={form.maxHealth} onChange={e=>update("maxHealth",Number(e.target.value))}/></label>
        <label className="md:col-span-2">설명<textarea className={input} value={form.description} onChange={e=>update("description",e.target.value)}/></label>
          <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-xs font-bold text-neutral-300">기본 초상화</div>
              <p className="mt-1 text-[10px] text-neutral-500">게임 시작부터 표시됩니다. 퀘스트 완료 초상화가 없으면 이 이미지를 계속 사용합니다.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {basicPortraitLocalUrl || form.imageUrl ? (
                  <img src={basicPortraitLocalUrl ?? form.imageUrl ?? undefined} alt="" className="h-24 w-20 rounded border border-neutral-700 object-cover" />
                ) : (
                  <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] text-neutral-600">이미지 없음</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={basicPortraitUploading}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      basicPortraitInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {basicPortraitUploading ? "업로드 중..." : basicPortraitLocalUrl || form.imageUrl ? "이미지 변경" : "이미지 파일 선택"}
                  </button>
                  {(basicPortraitLocalUrl || form.imageUrl) && (
                    <button type="button" disabled={basicPortraitUploading} onClick={removeBasicPortrait} className="flex items-center gap-2 rounded border border-red-900 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-950 disabled:opacity-40">
                      <Trash2 className="h-4 w-4" /> 이미지 제거
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-neutral-600">PNG, JPG, JPEG, WEBP · 저장 전 미리보기</p>
              <input
                ref={basicPortraitInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const file = event.target.files?.[0];
                  if (file) void uploadPortrait(file, "basic");
                }}
              />
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-neutral-300">퀘스트 완료 후 초상화</div>
                  <p className="mt-1 text-[10px] text-neutral-500">퀘스트 완료 후 표시할 이미지입니다. 업로드하지 않으면 기본 초상화가 표시됩니다.</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input type="checkbox" checked={form.questCompletedPortraitEnabled} onChange={(event) => update("questCompletedPortraitEnabled", event.target.checked)} />
                  사용
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {portraitLocalUrl || form.questCompletedPortraitUrl ? (
                  <img src={portraitLocalUrl ?? form.questCompletedPortraitUrl ?? undefined} alt="" className="h-24 w-20 rounded border border-neutral-700 object-cover" />
                ) : (
                  <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] text-neutral-600">이미지 없음</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={portraitUploading}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      portraitInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {portraitUploading ? "업로드 중..." : portraitLocalUrl || form.questCompletedPortraitUrl ? "이미지 변경" : "이미지 파일 선택"}
                  </button>
                  {(portraitLocalUrl || form.questCompletedPortraitUrl) && (
                    <button type="button" disabled={portraitUploading} onClick={removePortrait} className="flex items-center gap-2 rounded border border-red-900 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-950 disabled:opacity-40">
                      <Trash2 className="h-4 w-4" /> 이미지 제거
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-neutral-600">PNG, JPG, JPEG, WEBP · 저장 전 미리보기</p>
              <input
                ref={portraitInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const file = event.target.files?.[0];
                  if (file) void uploadPortrait(file, "completed");
                }}
              />
            </div>
          </div>
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
           questProgressRequired: e.target.checked
             ? (current.questProgressRequired ?? (typeof current.questCondition?.required === "number" ? current.questCondition.required : 1))
             : null,
           questCondition: e.target.checked && current.questCondition
             ? {
                 ...current.questCondition,
                 required: current.questProgressRequired
                   ?? (typeof current.questCondition.required === "number" ? current.questCondition.required : 1),
               }
             : current.questCondition,
         }))}/> 퀘스트 있음</label>
         {form.hasQuest && <><label>퀘스트 이름<input className={input} value={form.questName??""} onChange={e=>update("questName",e.target.value)}/></label><label>필요 진행도<input type="number" className={input} value={form.questProgressRequired??1} onChange={e=>updateQuestProgress(e.target.value===""?null:Number(e.target.value))}/></label>
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
          <label className="md:col-span-2 flex items-center gap-2 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-sm">
            <input type="checkbox" checked={form.isStarterGrant} onChange={e=>update("isStarterGrant", e.target.checked)} />
            신규 계정 Starter Champion
          </label>
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
       </div>
       <div className="mt-5 flex flex-wrap justify-end gap-2">
         {editing && editing.status !== "DISABLED" && (
           <button
             type="button"
             onClick={() => {
               window.location.href = `${import.meta.env.BASE_URL}?source=admin&testChampionId=${encodeURIComponent(editing.id)}`;
             }}
             className="rounded border border-sky-700 px-4 py-2.5 font-bold text-sky-300"
             data-testid="button-test-champion"
           >
             테스트 게임에서 확인
           </button>
         )}
         <button disabled={busy} onClick={()=>void save()} className="rounded bg-primary px-5 py-2.5 font-black text-black">DRAFT 저장</button>
       </div>
    </div></div>}
  </div>;
}

function FullAnalysisPanel({
  analysis,
  prompt,
  onCopyPrompt,
}: {
  analysis: FullAnalysis | null;
  prompt: string;
  onCopyPrompt: () => void;
}) {
  if (!analysis && !prompt) return null;
  return <div className="mb-4 rounded border border-neutral-700 bg-neutral-950 p-3 text-xs">
    {analysis && <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className={analysis.fullySupported ? "text-emerald-300" : "text-amber-300"}>
          {analysis.fullySupported ? "CHAMPION FULLY SUPPORTED" : "CHAMPION IMPLEMENTATION REVIEW"}
        </strong>
        {analysis.token && <span className="text-neutral-400">
          Linked Token: {analysis.token.name} · {analysis.token.attack}/{analysis.token.health} · {analysis.token.status}
        </span>}
      </div>
      {analysis.tokenReferenceError && <p className="mt-2 text-red-300">Champion Token: {analysis.tokenReferenceError}</p>}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {analysis.sections.map((section) => {
          const supported = section.status === "SUPPORTED";
          const failed = section.status === "ANALYSIS_FAILED";
          return <div key={section.key} className={`rounded border p-2 ${supported ? "border-emerald-900 bg-emerald-950/20" : failed ? "border-red-900 bg-red-950/20" : "border-amber-900 bg-amber-950/20"}`}>
            <div className="font-bold">{section.label}</div>
            <div className={`mt-1 ${supported ? "text-emerald-300" : failed ? "text-red-300" : "text-amber-300"}`}>
              {supported ? "SUPPORTED" : failed ? "ANALYSIS_FAILED" : "NEW_MECHANIC_REQUIRED"}
            </div>
            {section.analysis?.summaries?.length ? <ul className="mt-1 list-disc pl-4 text-neutral-300">{section.analysis.summaries.map((summary) => <li key={summary}>{summary}</li>)}</ul> : null}
            {section.analysis?.reason && <p className="mt-1 text-neutral-300">{section.analysis.reason}</p>}
          </div>;
        })}
      </div>
      {analysis.unsupportedParts.length > 0 && <div className="mt-3 rounded border border-amber-900 bg-amber-950/20 p-2">
        <div className="font-bold text-amber-300">중복 제거된 unsupported mechanics</div>
        <ul className="mt-1 list-disc pl-4 text-amber-100">{analysis.unsupportedParts.map((part) => <li key={part}>{part}</li>)}</ul>
      </div>}
    </div>}
    {prompt && <div className="mt-3">
      <div className="mb-1 font-bold text-neutral-300">Champion 전체 구현 프롬프트</div>
      <textarea readOnly value={prompt} className="min-h-72 w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-[10px] leading-relaxed"/>
      <button type="button" onClick={onCopyPrompt} className="mt-2 rounded border border-neutral-600 px-3 py-1.5">전체 프롬프트 복사</button>
    </div>}
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
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Ban,
  CheckCircle2,
  Copy,
  FilePenLine,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CardArtwork } from "./card-artwork";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

type CardType = "WRESTLER" | "TECHNIQUE";
type CardStatus = "DRAFT" | "PUBLISHED" | "DISABLED";
type CardKeyword =
  | "RUSH"
  | "SURPRISE"
  | "TAUNT"
  | "DODGE"
  | "MULTI_STRIKE";

type CardRecord = {
  id: string;
  name: string;
  cardType: CardType;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardKeyword[];
  isToken: boolean;
  isChampionToken: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  status: CardStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  imageAssetId: string | null;
  imageUrl: string | null;
};

type CardFormValues = {
  name: string;
  cardType: CardType;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardKeyword[];
  isToken: boolean;
  isChampionToken: boolean;
  effectId: string;
  effectConfig: string;
};
type EffectAnalysis = {
  status: "success" | "partial" | "failure";
  effects: Array<{ trigger: string; action: string; target?: { zone: string; owner: string; selection: string; count: number }; values?: { attack?: number; health?: number; amount?: number; keyword?: CardKeyword } }>;
  keywords: CardKeyword[];
  unsupportedSegments: string[];
  summaries: string[];
};

const EMPTY_CARD: CardFormValues = {
  name: "",
  cardType: "WRESTLER",
  cost: 0,
  attack: 0,
  health: 1,
  text: "",
  keywords: [],
  isToken: false,
  isChampionToken: false,
  effectId: "",
  effectConfig: "{}",
};

const KEYWORDS: CardKeyword[] = [
  "RUSH",
  "SURPRISE",
  "TAUNT",
  "DODGE",
  "MULTI_STRIKE",
];

const KEYWORD_LABELS: Record<CardKeyword, string> = {
  RUSH: "러쉬",
  SURPRISE: "기습",
  TAUNT: "도발",
  DODGE: "회피",
  MULTI_STRIKE: "연타",
};

function statusLabel(status: CardStatus) {
  if (status === "PUBLISHED") return "공개";
  if (status === "DISABLED") return "비활성";
  return "초안";
}

function statusClass(status: CardStatus) {
  if (status === "PUBLISHED") return "border-emerald-700 bg-emerald-950 text-emerald-300";
  if (status === "DISABLED") return "border-neutral-700 bg-neutral-900 text-neutral-500";
  return "border-amber-700 bg-amber-950 text-amber-300";
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

export function AdminCardManager({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [search, setSearch] = useState("");
  const [cardType, setCardType] = useState("");
  const [status, setStatus] = useState("");
  const [tokenKind, setTokenKind] = useState("");
  const [editingCard, setEditingCard] = useState<CardRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploadToken, setImageUploadToken] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [analysis, setAnalysis] = useState<EffectAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<CardFormValues>({ defaultValues: EMPTY_CARD });
  const preview = form.watch();

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setAnalysis(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (cardType) params.set("cardType", cardType);
    if (status) params.set("status", status);
    if (tokenKind) params.set("tokenKind", tokenKind);

    try {
      const response = await fetch(`${adminApiBase}/cards?${params}`, {
        credentials: "include",
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as { cards: CardRecord[] };
      setCards(body.cards);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "카드 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [cardType, onUnauthorized, search, status, tokenKind]);

  useEffect(() => {
    const timer = window.setTimeout(loadCards, 200);
    return () => window.clearTimeout(timer);
  }, [loadCards]);

  function openCreate() {
    setEditingCard(null);
    form.reset(EMPTY_CARD);
    setImageAssetId(null);
    setImageUrl(null);
    setImageUploadToken(null);
    setLocalPreviewUrl(null);
    setError("");
    setAnalysis(null);
    setIsFormOpen(true);
  }

  function openEdit(card: CardRecord) {
    setEditingCard(card);
    form.reset({
      name: card.name,
      cardType: card.cardType,
      cost: card.cost,
      attack: card.attack,
      health: card.health,
      text: card.text,
      keywords: card.keywords,
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      effectId: card.effectId ?? "",
      effectConfig: JSON.stringify(card.effectConfig, null, 2),
    });
    setImageAssetId(card.imageAssetId);
    setImageUrl(card.imageUrl);
    setImageUploadToken(null);
    setLocalPreviewUrl(null);
    setError("");
    setIsFormOpen(true);
  }

  async function submitCard(values: CardFormValues) {
    setError("");
    let effectConfig: Record<string, unknown>;
    try {
      const parsed = JSON.parse(values.effectConfig || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error();
      }
      effectConfig = parsed as Record<string, unknown>;
    } catch {
      setError("효과 설정은 JSON 객체 형식이어야 합니다.");
      return;
    }

    const payload = {
      ...values,
      cost: Number(values.cost),
      attack: Number(values.attack),
      health: Number(values.health),
      isToken: values.isToken || values.isChampionToken,
      effectId: values.effectId.trim() || null,
      effectConfig,
      imageAssetId,
      imageUrl,
      imageUploadToken,
    };

    setBusyId(editingCard?.id ?? "create");
    try {
      const response = await fetch(
        editingCard
          ? `${adminApiBase}/cards/${editingCard.id}`
          : `${adminApiBase}/cards`,
        {
          method: editingCard ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage(editingCard ? "카드를 수정했습니다." : "새 카드를 DRAFT로 생성했습니다.");
      clearLocalPreview();
      setIsFormOpen(false);
      await loadCards();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "카드를 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function analyzeEffects() {
    const text = form.getValues("text").trim();
    if (!text) { setError("분석할 카드 효과 텍스트를 입력해 주세요."); return; }
    setError(""); setIsAnalyzing(true);
    try {
      const response = await fetch(`${adminApiBase}/effects/analyze`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await responseMessage(response));
      setAnalysis(await response.json() as EffectAnalysis);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "효과를 분석하지 못했습니다.");
    } finally { setIsAnalyzing(false); }
  }

  function applyAnalysis() {
    if (!analysis || analysis.status !== "success") return;
    if (analysis.keywords.length) {
      form.setValue("keywords", [...new Set([...form.getValues("keywords"), ...analysis.keywords])], { shouldDirty: true });
    }
    if (analysis.effects.length) {
      form.setValue("effectId", "STRUCTURED_EFFECTS_V1", { shouldDirty: true });
      form.setValue("effectConfig", JSON.stringify({ effects: analysis.effects }, null, 2), { shouldDirty: true });
    }
    setMessage("분석 결과를 적용했습니다. 카드 저장을 눌러 DRAFT에 저장하세요.");
  }

  function clearLocalPreview() {
    setLocalPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function discardPendingImage() {
    if (!imageAssetId || !imageUploadToken) return;
    await fetch(`${adminApiBase}/cards/images/discard`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageAssetId, imageUploadToken }),
    });
  }

  function removeImage() {
    void discardPendingImage();
    clearLocalPreview();
    setImageAssetId(null);
    setImageUrl(null);
    setImageUploadToken(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function closeForm() {
    void discardPendingImage();
    clearLocalPreview();
    setIsFormOpen(false);
  }

  async function uploadImage(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const allowed =
      (file.type === "image/png" && extension === "png") ||
      (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
      (file.type === "image/webp" && extension === "webp");
    if (!allowed) {
      setError("PNG, JPG, JPEG, WEBP 이미지 파일만 선택할 수 있습니다.");
      return;
    }

    await discardPendingImage();
    clearLocalPreview();
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setError("");
    setIsUploadingImage(true);
    try {
      const requestResponse = await fetch(`${adminApiBase}/cards/images/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      if (requestResponse.status === 401) {
        onUnauthorized();
        return;
      }
      if (!requestResponse.ok) {
        throw new Error(await responseMessage(requestResponse));
      }
      const upload = (await requestResponse.json()) as {
        uploadURL: string;
        objectPath: string;
        contentType: string;
      };
      const uploadResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("이미지 파일 업로드에 실패했습니다.");

      const completeResponse = await fetch(`${adminApiBase}/cards/images/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectPath: upload.objectPath,
          contentType: file.type,
        }),
      });
      if (completeResponse.status === 401) {
        onUnauthorized();
        return;
      }
      if (!completeResponse.ok) {
        throw new Error(await responseMessage(completeResponse));
      }
      const asset = (await completeResponse.json()) as {
        imageAssetId: string;
        imageUrl: string;
        imageUploadToken: string;
      };
      setImageAssetId(asset.imageAssetId);
      setImageUrl(asset.imageUrl);
      setImageUploadToken(asset.imageUploadToken);
      setMessage("이미지를 업로드했습니다. 카드 저장을 눌러 적용하세요.");
    } catch (uploadError) {
      clearLocalPreview();
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "이미지를 업로드하지 못했습니다.",
      );
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function mutateCard(path: string, successMessage: string, id: string, body?: object) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}${path}`, {
        method: "POST",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage(successMessage);
      await loadCards();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-600">CONTENT MANAGEMENT</div>
          <h2 className="mt-1 text-xl font-black">카드 관리</h2>
          <p className="mt-1 text-xs text-neutral-500">새 카드는 DRAFT로 저장되며 PUBLISHED 카드만 신규 게임에 반영됩니다.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          data-testid="button-create-card"
          className="flex items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black hover:bg-yellow-400"
        >
          <Plus className="h-4 w-4" /> 새 카드 추가
        </button>
      </div>

      <div className="mb-4 grid gap-2 rounded-lg border border-neutral-800 bg-black/40 p-3 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(120px,auto))]">
        <label className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-600" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="카드 이름 검색"
            data-testid="input-card-search"
            className="w-full rounded border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <select value={cardType} onChange={(event) => setCardType(event.target.value)} data-testid="select-card-type" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 종류</option>
          <option value="WRESTLER">선수</option>
          <option value="TECHNIQUE">기술</option>
        </select>
        <select value={tokenKind} onChange={(event) => setTokenKind(event.target.value)} data-testid="select-token-kind" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 카드</option>
          <option value="STANDARD">일반 카드</option>
          <option value="TOKEN">토큰</option>
          <option value="CHAMPION_TOKEN">챔피언 토큰</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-card-status" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 상태</option>
          <option value="DRAFT">DRAFT</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {(message || error) && (
        <div data-testid="status-card-action" className={`mb-4 rounded border px-3 py-2 text-xs font-bold ${error ? "border-red-900 bg-red-950/50 text-red-300" : "border-emerald-900 bg-emerald-950/50 text-emerald-300"}`}>
          {error || message}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="bg-neutral-900 text-neutral-500">
            <tr>
              {["이름", "종류", "비용", "공격력", "체력", "상태", "버전", "수정일", "작업"].map((label) => (
                <th key={label} className="px-3 py-3 font-bold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {cards.map((card) => (
             <tr key={card.id} data-testid={`row-card-${card.id}`} onClick={() => openEdit(card)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openEdit(card); }} tabIndex={0} className="cursor-pointer bg-neutral-950 hover:bg-neutral-900/60 focus:bg-neutral-900 focus:outline-none">
                 <td className="px-3 py-3">
                  <div className="font-bold text-neutral-100">{card.name}</div>
                  {(card.isToken || card.isChampionToken) && <div className="mt-1 text-[10px] text-primary">{card.isChampionToken ? "챔피언 토큰" : "토큰"}</div>}
                </td>
                <td className="px-3 py-3 text-neutral-400">{card.cardType === "WRESTLER" ? "선수" : "기술"}</td>
                <td className="px-3 py-3">{card.cost}</td>
                <td className="px-3 py-3">{card.attack}</td>
                <td className="px-3 py-3">{card.health}</td>
                <td className="px-3 py-3"><span className={`rounded border px-2 py-1 text-[10px] font-black ${statusClass(card.status)}`}>{statusLabel(card.status)}</span></td>
                <td className="px-3 py-3">v{card.version}</td>
                <td className="px-3 py-3 text-neutral-500">{new Date(card.updatedAt).toLocaleString("ko-KR")}</td>
                 <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => openEdit(card)} data-testid={`button-edit-card-${card.id}`} className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-1.5 font-bold hover:border-primary hover:text-primary"><FilePenLine className="h-3 w-3" /> 수정</button>
                    <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/duplicate`, `${card.name} Copy를 생성했습니다.`, card.id)} data-testid={`button-duplicate-card-${card.id}`} className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-1.5 font-bold hover:border-primary hover:text-primary disabled:opacity-40"><Copy className="h-3 w-3" /> 복제</button>
                    {card.status !== "PUBLISHED" && <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/status`, "카드를 공개했습니다.", card.id, { status: "PUBLISHED" })} data-testid={`button-publish-card-${card.id}`} className="flex items-center gap-1 rounded border border-emerald-800 px-2 py-1.5 font-bold text-emerald-400 hover:bg-emerald-950 disabled:opacity-40"><CheckCircle2 className="h-3 w-3" /> 공개</button>}
                    {card.status !== "DISABLED" && <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/status`, "카드를 비활성화했습니다.", card.id, { status: "DISABLED" })} data-testid={`button-disable-card-${card.id}`} className="flex items-center gap-1 rounded border border-red-900 px-2 py-1.5 font-bold text-red-400 hover:bg-red-950 disabled:opacity-40"><Ban className="h-3 w-3" /> 비활성화</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && cards.length === 0 && <div data-testid="status-empty-cards" className="p-10 text-center text-sm text-neutral-600">조건에 맞는 카드가 없습니다.</div>}
        {isLoading && <div data-testid="status-loading-cards" className="p-10 text-center text-sm text-neutral-600">카드 목록을 불러오는 중...</div>}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
           <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black">{editingCard ? "카드 수정" : "새 카드 추가"}</h3>
                <p className="mt-1 text-xs text-neutral-500">{editingCard ? `저장하면 v${editingCard.version + 1}로 증가합니다.` : "새 카드는 DRAFT 상태로 생성됩니다."}</p>
              </div>
               <button type="button" onClick={closeForm} data-testid="button-close-card-form" className="rounded p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
             <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
             <form onSubmit={form.handleSubmit(submitCard)} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">이름</span><input {...form.register("name", { required: true })} data-testid="input-card-name" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
               <div className="space-y-2 rounded border border-neutral-800 bg-neutral-900/50 p-3 md:col-span-2">
                 <div className="text-xs font-bold text-neutral-400">카드 이미지</div>
                 <input
                   ref={imageInputRef}
                   type="file"
                   accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                   className="hidden"
                   data-testid="input-card-image"
                   onChange={(event) => {
                     const file = event.target.files?.[0];
                     if (file) void uploadImage(file);
                   }}
                 />
                 <div className="flex flex-wrap gap-2">
                   <button
                     type="button"
                     disabled={isUploadingImage}
                     onClick={() => imageInputRef.current?.click()}
                     data-testid={imageUrl || localPreviewUrl ? "button-change-card-image" : "button-select-card-image"}
                     className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40"
                   >
                     <ImagePlus className="h-4 w-4" />
                     {isUploadingImage ? "업로드 중..." : imageUrl || localPreviewUrl ? "이미지 변경" : "이미지 파일 선택"}
                   </button>
                   {(imageUrl || localPreviewUrl) && (
                     <button
                       type="button"
                       disabled={isUploadingImage}
                       onClick={removeImage}
                       data-testid="button-remove-card-image"
                       className="flex items-center gap-2 rounded border border-red-900 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-950 disabled:opacity-40"
                     >
                       <Trash2 className="h-4 w-4" /> 이미지 제거
                     </button>
                   )}
                 </div>
                 <p className="text-[10px] text-neutral-600">PNG, JPG, JPEG, WEBP · 서버 설정 크기 제한 적용</p>
               </div>
              <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">카드 종류</span><select {...form.register("cardType")} data-testid="input-card-card-type" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select></label>
              <div className="grid grid-cols-3 gap-2">
                {(["cost", "attack", "health"] as const).map((field) => <label key={field} className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">{{ cost: "비용", attack: "공격력", health: "체력" }[field]}</span><input type="number" min={0} max={999} {...form.register(field, { required: true, valueAsNumber: true })} data-testid={`input-card-${field}`} className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 outline-none focus:border-primary" /></label>)}
              </div>
                <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">카드 효과 설명</span><textarea {...form.register("text", { onChange: () => { setAnalysis(null); form.setValue("effectId", ""); form.setValue("effectConfig", "{}"); } })} rows={3} data-testid="input-card-text" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
                <div className="space-y-3 md:col-span-2">
                  <button type="button" onClick={() => void analyzeEffects()} disabled={isAnalyzing} data-testid="button-analyze-effects" className="rounded border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-40">{isAnalyzing ? "분석 중..." : "효과 분석"}</button>
                  {analysis && <div className={`rounded border p-3 text-xs ${analysis.status === "success" ? "border-emerald-800 bg-emerald-950/30" : "border-amber-800 bg-amber-950/30"}`} data-testid="effect-analysis-result">
                    <strong>{analysis.status === "success" ? "✓ 분석 성공" : analysis.status === "partial" ? "⚠ 부분 분석 — 적용할 수 없습니다." : "✗ 분석 실패 — 적용할 수 없습니다."}</strong>
                    {analysis.effects.map((effect, index) => {
                       const update = (patch: Partial<typeof effect>, targetPatch?: Partial<NonNullable<typeof effect.target>>, valuesPatch?: Partial<NonNullable<typeof effect.values>>) => setAnalysis((current) => current ? { ...current, effects: current.effects.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, ...(item.target ? { target: { ...item.target, ...targetPatch } } : {}), values: { ...item.values, ...valuesPatch } } : item) } : current);
                      return <div key={index} className="mt-2 rounded bg-black/30 p-2">발동: {effect.trigger} · 행동: {effect.action}
                         {effect.target && <div className="mt-2 grid gap-2 sm:grid-cols-4">
                           <label>소유자<select value={effect.target.owner} onChange={(e) => update({}, { owner: e.target.value })} className="ml-1 bg-neutral-900"><option value="SELF">내</option><option value="ENEMY">적</option><option value="ALL">모두</option></select></label>
                           <label>영역<select value={effect.target.zone} onChange={(e) => update({}, { zone: e.target.value })} className="ml-1 bg-neutral-900"><option value="BOARD">필드</option><option value="HAND">손패</option><option value="PLAYER">플레이어</option><option value="CHARACTER">캐릭터</option></select></label>
                           <label>선택<select value={effect.target.selection} onChange={(e) => update({}, { selection: e.target.value })} className="ml-1 bg-neutral-900"><option value="SELF">자신</option><option value="PLAYER_CHOICE">직접 선택</option><option value="RANDOM">무작위</option><option value="ALL">모든 대상</option></select></label>
                          <label>수<input type="number" min="1" value={effect.target.count} onChange={(e) => update({}, { count: Math.max(1, Number(e.target.value) || 1) })} className="ml-1 w-12 bg-neutral-900" /></label>
                          {(["attack", "health", "amount"] as const).map((key) => <label key={key}>{key}<input type="number" value={effect.values?.[key] ?? 0} onChange={(e) => update({}, undefined, { [key]: Number(e.target.value) || 0 })} className="ml-1 w-12 bg-neutral-900" /></label>)}
                         </div>}
                         {effect.values?.keyword && <div className="mt-2 text-primary">키워드: {KEYWORD_LABELS[effect.values.keyword]}</div>}
                      </div>;
                    })}
                     {analysis.keywords.map((keyword) => <div key={keyword} className="mt-2 text-emerald-300">기본 키워드: {KEYWORD_LABELS[keyword]}</div>)}
                     {analysis.unsupportedSegments.map((segment) => <div key={segment} className="mt-2 text-amber-300">지원하지 않음: {segment}</div>)}
                    <div className="mt-3 flex gap-2"><button type="button" disabled={analysis.status !== "success"} onClick={applyAnalysis} data-testid="button-apply-analysis" className="rounded bg-primary px-3 py-1.5 font-bold text-black disabled:opacity-40">분석 결과 적용</button><button type="button" onClick={() => void analyzeEffects()} className="rounded border border-neutral-600 px-3 py-1.5">다시 분석</button><button type="button" onClick={() => setAnalysis(null)} className="rounded border border-neutral-600 px-3 py-1.5">취소</button></div>
                    <details className="mt-2"><summary>고급 JSON 보기</summary><pre className="mt-1 overflow-auto text-[10px]">{JSON.stringify(analysis.effects, null, 2)}</pre></details>
                  </div>}
                </div>
               <fieldset className="space-y-2 md:col-span-2"><legend className="text-xs font-bold text-neutral-400">키워드</legend><div className="flex flex-wrap gap-2">{KEYWORDS.map((keyword) => <label key={keyword} className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs"><input type="checkbox" value={keyword} {...form.register("keywords")} data-testid={`input-keyword-${keyword}`} />{KEYWORD_LABELS[keyword]}</label>)}</div></fieldset>
              <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isToken")} data-testid="input-card-token" /> 토큰 카드</label>
              <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isChampionToken")} data-testid="input-card-champion-token" /> 챔피언 토큰</label>
               <div className="space-y-2 md:col-span-2">
                 <div className="rounded border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-xs leading-relaxed text-blue-200">
                    효과 텍스트를 입력한 뒤 <strong>효과 분석</strong>을 누르고 결과를 확인해 적용하세요. 지원하지 않는 문장은 저장용 효과로 적용할 수 없습니다.
                 </div>
                 <details className="rounded border border-neutral-800 bg-neutral-900/50 p-3">
                   <summary className="cursor-pointer text-xs font-bold text-neutral-500">고급 효과 설정 (선택 사항)</summary>
                   <div className="mt-3 grid gap-3 md:grid-cols-2">
                     <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 ID</span><input {...form.register("effectId")} placeholder="자동 적용을 권장합니다" data-testid="input-card-effect-id" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
                     <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 설정 JSON</span><textarea {...form.register("effectConfig")} rows={3} data-testid="input-card-effect-config" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs outline-none focus:border-primary" /></label>
                   </div>
                 </details>
               </div>
              {error && <p role="alert" className="md:col-span-2 rounded border border-red-900 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4 md:col-span-2">
                  {editingCard && editingCard.cardType === "WRESTLER" && editingCard.status !== "DISABLED" && <button type="button" onClick={() => { window.location.href = `${import.meta.env.BASE_URL}?testCardId=${encodeURIComponent(editingCard.id)}`; }} className="rounded border border-sky-700 px-4 py-2 text-sm font-bold text-sky-300" data-testid="button-test-card">테스트 게임에서 확인</button>}
                 <button type="button" onClick={closeForm} className="rounded border border-neutral-700 px-4 py-2 text-sm font-bold" data-testid="button-cancel-card">취소</button>
                 <button type="submit" disabled={busyId !== null || isUploadingImage} className="rounded bg-primary px-5 py-2 text-sm font-black text-black disabled:opacity-40" data-testid="button-save-card">{editingCard ? "수정 저장" : "DRAFT로 생성"}</button>
              </div>
            </form>
             <aside className="lg:sticky lg:top-0 lg:self-start">
               <div className="mb-3 text-[10px] font-black tracking-[0.18em] text-neutral-500">실시간 미리보기</div>
               <AdminCardPreview
                 name={preview.name}
                 cost={Number(preview.cost) || 0}
                 attack={Number(preview.attack) || 0}
                 health={Number(preview.health) || 0}
                 text={preview.text}
                 imageUrl={localPreviewUrl ?? imageUrl}
               />
               <p className="mt-4 text-center text-[10px] leading-relaxed text-neutral-600">미리보기 전용 카드입니다.<br />게임 액션은 실행되지 않습니다.</p>
             </aside>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminCardPreview({
  name,
  cost,
  attack,
  health,
  text,
  imageUrl,
}: {
  name: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  imageUrl: string | null;
}) {
  return (
    <div data-testid="card-live-preview" className="relative mx-auto flex h-[360px] w-[240px] select-none flex-col rounded-lg border-2 border-blue-600/70 bg-neutral-800 shadow-[0_15px_40px_rgba(0,0,0,0.7)]">
      <div className="absolute -left-3 -top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-900 bg-blue-700 font-display text-lg font-black text-white shadow">
        {cost}
      </div>
      <div className="flex h-12 items-center justify-center overflow-hidden rounded-t-md border-b border-neutral-700 bg-neutral-800 px-5">
        <span className="truncate text-sm font-black text-white">{name || "카드 이름"}</span>
      </div>
      <CardArtwork src={imageUrl} alt={name || "카드 미리보기"} className="min-h-0 w-full flex-1" />
      <div className="h-24 border-t border-neutral-800 bg-neutral-900/95 p-3 text-xs leading-relaxed text-neutral-300">
        <span className="line-clamp-4">{text || "효과 없음"}</span>
      </div>
      <div className="absolute -bottom-3 -left-3 flex h-10 w-10 items-center justify-center rounded border-2 border-yellow-700 bg-primary font-display text-lg font-black text-black shadow">
        {attack}
      </div>
      <div className="absolute -bottom-3 -right-3 flex h-10 w-10 items-center justify-center rounded border-2 border-red-800 bg-red-600 font-display text-lg font-black text-white shadow">
        {health}
      </div>
    </div>
  );
}
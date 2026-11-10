import {AdminEditorWorkspace} from './admin-editor-workspace';
import {useTagLabels} from '@/lib/tag-labels';
import {TagLabel} from './tag-label';
import {ImageDisplaySlider} from "./image-display-slider";
import {AdminEditorSections,useAdminDraftGuard,confirmDiscardAdminDraft} from './admin-editor-sections';
import { ChampionQuestConditionEditor } from './champion-quest-condition-editor';
import { validChampionQuestCondition } from '@workspace/game-engine';
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import {
  Ban,
  CheckCircle2,
  Copy,
  EyeOff,
  FilePenLine,
  ImagePlus,
  Maximize2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CardRenderer } from "./card-renderer";
import { AdminAudioField } from "./admin-audio-field";
import { keywordSettingsAfterTextEdit } from "@/lib/admin-effect-config";
import { useToast } from "../hooks/use-toast";
import {
  CARD_RARITY_LABELS,
  DEFAULT_IMAGE_DISPLAY_SETTINGS,
  normalizeImageDisplaySettings,
  normalizeCardRarity,
  normalizeCardRarityForType,
  allowedCardRarities,
  type CardRarity,
  type ImageDisplayMode,
  type ImageDisplaySettings,
} from "../game/cards/types";
import { ROUTES } from "@/lib/routes";

const adminApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;

type CardType = "WRESTLER" | "TECHNIQUE";
type CardStatus = "DRAFT" | "PUBLISHED" | "DISABLED";
type EffectAuditResult = { id: string; status: "missing" | "review" | "aligned" | "none"; reason: string };
type CardKeyword =
  | "PROGRAM"
  | "RUSH"
  | "SURPRISE"
  | "TAUNT"
  | "DODGE"
  | "MULTI_STRIKE" | "IMMUNE" | "REGEN" | "ARMOR" | "CONDITION" | "DEFENSE" | "LIFESTEAL" | "COUNTDOWN" | "WANTED" | "FUSION" | "CANNOT_ATTACK";

type CardRecord = {
  id: string;
  name: string;
  cardType: CardType;
  rarity?: CardRarity;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardKeyword[];
  tags?: string[];
  isToken: boolean;
  isChampionToken: boolean;
  isStarterGrant?: boolean;
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  status: CardStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  imageDisplayMode?: ImageDisplayMode;
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  entranceAudioAssetId: string | null;
  entranceAudioUrl: string | null;
  entranceAudioVolume: number;
  entranceAudioEnabled: boolean;
  summonLine: string | null;
  retireLine: string | null; destroyLine: string | null;
};

type CardFormValues = {
  name: string;
  cardType: CardType;
  rarity: CardRarity;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: CardKeyword[];
  tags: string[];
  isToken: boolean;
  isChampionToken: boolean;
  isStarterGrant: boolean;
  summonLine: string;
  retireLine: string; destroyLine: string;
  effectId: string;
  effectConfig: string;
};
const EMPTY_CARD: CardFormValues = {
  name: "",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 0,
  attack: 0,
  health: 1,
  text: "",
  keywords: [],
  tags: [],
  isToken: false,
  isChampionToken: false,
  isStarterGrant: false,
  summonLine: "", retireLine: "", destroyLine: "",
  effectId: "",
  effectConfig: "{}",
};

const KEYWORDS: CardKeyword[] = [
  "PROGRAM",
  "RUSH",
  "SURPRISE",
  "TAUNT",
  "DODGE",
  "MULTI_STRIKE", "IMMUNE", "REGEN", "ARMOR", "CONDITION", "DEFENSE", "LIFESTEAL", "COUNTDOWN", "WANTED", "FUSION", "CANNOT_ATTACK",
];

const KEYWORD_LABELS: Record<CardKeyword, string> = {
  PROGRAM: "업그레이드",
  FUSION: '합체', CANNOT_ATTACK: '공격불가',
  WANTED: '수배',
  COUNTDOWN: '카운트다운', IMMUNE: '면역', REGEN: '치유', ARMOR: '아머', CONDITION: '조건', DEFENSE: '방어', LIFESTEAL: '흡혈',

  RUSH: "러쉬",
  SURPRISE: "기습",
  TAUNT: "도발",
  DODGE: "회피",
  MULTI_STRIKE: "연타",
};

function statusLabel(status: CardStatus) {
  if (status === "PUBLISHED") return "공개";
  if (status === "DISABLED") return "비활성화";
  return "미공개";
}

function statusClass(status: CardStatus) {
  if (status === "PUBLISHED") return "border-emerald-700 bg-emerald-950 text-emerald-300";
  if (status === "DISABLED") return "border-neutral-700 bg-neutral-900 text-neutral-500";
  return "border-amber-700 bg-amber-950 text-amber-300";
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string; referenceErrors?: string[]; dependents?: string[] };
    return [body.message ?? "요청을 처리하지 못했습니다.", ...(body.referenceErrors ?? []), ...(body.dependents ?? [])].join("\n");
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

export function AdminCardManager({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const [, navigate] = useLocation();
  const tagLabels=useTagLabels();
  const { toast } = useToast();
  const [listPage,setListPage]=useState(0),[tagFilter,setTagFilter]=useState(""),[listSort,setListSort]=useState("updated");
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [excludedDraftCardIds, setExcludedDraftCardIds] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [cardType, setCardType] = useState("");
  const [rarity, setRarity] = useState("");
  const [status, setStatus] = useState("");
  const [auditResults, setAuditResults] = useState<Record<string, EffectAuditResult> | null>(null);
  const [auditFilter, setAuditFilter] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [tokenKind, setTokenKind] = useState("");
  const [editingCard, setEditingCard] = useState<CardRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const saveRequest=useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionErrorCardId, setActionErrorCardId] = useState<string | null>(null);
  const [imageAssetId, setImageAssetId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploadToken, setImageUploadToken] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [imageDisplaySettings, setImageDisplaySettings] = useState<ImageDisplaySettings>({
    ...DEFAULT_IMAGE_DISPLAY_SETTINGS,
  });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [entranceAudio, setEntranceAudio] = useState({
    assetId: null as string | null,
    url: null as string | null,
    volume: 100,
    enabled: false,
    uploadToken: null as string | null,
    fileName: null as string | null,
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<CardFormValues>({ defaultValues: EMPTY_CARD });
  const preview = form.watch();
  let keywordConfig: Record<string, unknown> = {};
  try { keywordConfig = JSON.parse(preview.effectConfig || '{}'); } catch {}
  const updateKeywordConfig = (key: string, value: unknown) => {
    let current: Record<string, unknown>;
    try { current = JSON.parse(form.getValues('effectConfig') || '{}'); } catch { return; }
    form.setValue('effectConfig', JSON.stringify({ ...current, [key]: value }, null, 2), { shouldDirty: true });
  };
  const previewCardType = preview.cardType as CardType;

  useEffect(() => {
    if (previewCardType !== "TECHNIQUE") return;
    const rarity = form.getValues("rarity");
    const next = normalizeCardRarityForType("TECHNIQUE", rarity, preview);
    if (rarity !== next) form.setValue("rarity", next, { shouldDirty: true });
  }, [form, previewCardType, preview.rarity, preview.isToken, preview.isChampionToken]);

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (cardType) params.set("cardType", cardType);
    if (rarity) params.set("rarity", rarity);
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
      const selection = await fetch(`${adminApiBase}/draft/card-selection`, { credentials: "include" });
      if (selection.status === 401) { onUnauthorized(); return; }
      if (!selection.ok) throw new Error(await responseMessage(selection));
      setExcludedDraftCardIds((await selection.json()).excludedCardIds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "카드 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [cardType, onUnauthorized, rarity, search, status, tokenKind]);

  async function toggleDraftSelection(card: CardRecord) {
    if (excludedDraftCardIds === null) return;
    const excluded = !excludedDraftCardIds.includes(card.id);
    setBusyId(card.id);
    setError("");
    setActionErrorCardId(null);
    try {
      const response = await fetch(`${adminApiBase}/draft/cards/${encodeURIComponent(card.id)}/selection`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded }),
      });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await responseMessage(response));
      setExcludedDraftCardIds((await response.json()).excludedCardIds);
      setMessage(excluded ? "새 드래프트의 카드 선택에서만 숨겼습니다." : "새 드래프트의 카드 선택에 다시 표시합니다.");
    } catch (error) {
      setActionErrorCardId(card.id);
      setError(error instanceof Error ? error.message : "드래프트 선택 설정을 변경하지 못했습니다.");
    } finally { setBusyId(null); }
  }

  async function runEffectAudit() {
    setAuditing(true);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}/cards/effect-audit`, { credentials: "include" });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = await response.json() as { results: EffectAuditResult[] };
      setAuditResults(Object.fromEntries(body.results.map((result) => [result.id, result])));
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "카드 효과를 점검하지 못했습니다.");
    } finally {
      setAuditing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadCards, 200);
    return () => window.clearTimeout(timer);
  }, [loadCards]);

  function openCreate() {
    setEditingCard(null);
    form.reset(EMPTY_CARD);
    setTagDraft("");
    setImageAssetId(null);
    setImageUrl(null);
    setImageUploadToken(null);
    setLocalPreviewUrl(null);
    setImageDisplaySettings({ ...DEFAULT_IMAGE_DISPLAY_SETTINGS });
    setEntranceAudio({ assetId: null, url: null, volume: 100, enabled: false, uploadToken: null, fileName: null });
    setError("");
    setIsFormOpen(true);
  }

  function openEdit(card: CardRecord) {
    setEditingCard(card);
    form.reset({
      name: card.name,
      cardType: card.cardType,
      rarity: normalizeCardRarityForType(card.cardType, card.rarity, card),
      cost: card.cost,
      attack: card.attack,
      health: card.health,
      text: card.text,
      keywords: card.keywords,
      tags: Array.isArray(card.tags) ? card.tags : [],
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      isStarterGrant: card.isStarterGrant ?? false,
      summonLine: card.summonLine ?? "",
      retireLine: card.retireLine ?? "", destroyLine: card.destroyLine ?? "",
      effectId: card.effectId ?? "",
      effectConfig: JSON.stringify(card.effectConfig, null, 2),
    });
    setImageAssetId(card.imageAssetId);
    setImageUrl(card.imageUrl);
    setImageUploadToken(null);
    setLocalPreviewUrl(null);
    setImageDisplaySettings(normalizeImageDisplaySettings(card));
    setEntranceAudio({
      assetId: card.entranceAudioAssetId,
      url: card.entranceAudioUrl,
      volume: card.entranceAudioVolume ?? 100,
      enabled: card.entranceAudioEnabled ?? false,
      uploadToken: null,
      fileName: null,
    });
    setTagDraft("");
    setError("");
    setIsFormOpen(true);
  }

  async function submitCard(values: CardFormValues) {
    if(saveRequest.current || isUploadingImage)return;
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
      ...imageDisplaySettings,
      entranceAudioAssetId: entranceAudio.assetId,
      entranceAudioUrl: entranceAudio.url,
      entranceAudioVolume: entranceAudio.volume,
      entranceAudioEnabled: entranceAudio.enabled,
      entranceAudioUploadToken: entranceAudio.uploadToken,
    };

    saveRequest.current=true;
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
      setMessage(editingCard ? "카드를 수정했습니다." : "새 카드를 미공개로 생성했습니다.");
      clearLocalPreview();
      setIsFormOpen(false);
      setAuditResults(null);
      setAuditFilter("");
      await loadCards();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "카드를 저장하지 못했습니다.");
    } finally {
      saveRequest.current=false;
      setBusyId(null);
    }
  }

  function addTag() {
    const rawTag = tagDraft.trim();
    const tag = Object.entries(tagLabels).find(([,label])=>label===rawTag)?.[0]??rawTag;
    const tags = form.getValues("tags") ?? [];
    if (!tag || tags.includes(tag)) return;
    form.setValue("tags", [...tags, tag], { shouldDirty: true });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    form.setValue("tags", (form.getValues("tags") ?? []).filter((current) => current !== tag), { shouldDirty: true });
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
    if(!confirmDiscardAdminDraft(adminDraftDirty))return;
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
    setActionErrorCardId(null);
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
      setAuditResults(null);
      setAuditFilter("");
      await loadCards();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "요청을 처리하지 못했습니다.");
      setActionErrorCardId(id);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCard(card: CardRecord) {
    if (!window.confirm(`"${card.name}" 카드를 삭제하시겠습니까?\n삭제한 카드는 복구할 수 없습니다.`)) return;
    setBusyId(card.id);
    setError("");
    try {
      const response = await fetch(`${adminApiBase}/cards/${card.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage(`"${card.name}" 카드를 삭제했습니다.`);
      if (editingCard?.id === card.id) {
        closeForm();
      }
      setAuditResults(null);
      setAuditFilter("");
      await loadCards();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "카드를 삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const filteredAdminCards=cards.filter(card=>(!auditFilter||auditResults?.[card.id]?.status===auditFilter)&&(!tagFilter||card.tags?.includes(tagFilter))).sort((a,b)=>listSort==="name"?a.name.localeCompare(b.name,"ko"):listSort==="cost"?a.cost-b.cost:Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  useEffect(()=>setListPage(0),[search,cardType,rarity,status,tokenKind,auditFilter,tagFilter,listSort]);
  useEffect(()=>setListPage(p=>Math.min(p,Math.max(0,Math.ceil(filteredAdminCards.length/30)-1))),[filteredAdminCards.length]);
  const adminDraftDirty=useAdminDraftGuard(isFormOpen,{preview,imageDisplaySettings,imageUrl,entranceAudio});
  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-neutral-600">CONTENT MANAGEMENT</div>
          <h2 className="mt-1 text-xl font-black">카드 관리</h2>
          <p className="mt-1 text-xs text-neutral-500">새 카드는 미공개로 저장됩니다. 공개는 일반 배포, 미공개는 일반 배포 제외, 비활성화는 일반 사용 중지 상태입니다.</p>
        </div>
        <div className="flex gap-2">

          <button type="button" onClick={openCreate} data-testid="button-create-card" className="flex items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black hover:bg-yellow-400"><Plus className="h-4 w-4" /> 새 카드 추가</button>
        </div>
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
        <select value={cardType} onChange={(event) => {
          setCardType(event.target.value);
          if (event.target.value === "TECHNIQUE" && rarity && !allowedCardRarities("TECHNIQUE").includes(rarity as CardRarity)) setRarity("");
        }} aria-label="카드 종류 필터" data-testid="select-card-type" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 종류</option>
          <option value="WRESTLER">선수</option>
          <option value="TECHNIQUE">기술</option>
        </select>
        <select value={rarity} onChange={(event) => setRarity(event.target.value)} aria-label="카드 등급 필터" data-testid="select-card-rarity" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 등급</option>
          {allowedCardRarities(cardType === "TECHNIQUE" ? "TECHNIQUE" : "WRESTLER").map((grade) => <option key={grade} value={grade}>{grade}</option>)}
        </select>
        <select value={tokenKind} onChange={(event) => setTokenKind(event.target.value)} aria-label="토큰 종류 필터" data-testid="select-token-kind" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 카드</option>
          <option value="STANDARD">일반 카드</option>
          <option value="TOKEN">토큰</option>
          <option value="CHAMPION_TOKEN">챔피언 토큰</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="카드 공개 상태 필터" data-testid="select-card-status" className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          <option value="">모든 상태</option>
          <option value="DRAFT">미공개</option>
          <option value="PUBLISHED">공개</option>
          <option value="DISABLED">비활성화</option>
        </select>
      </div>

<div className="admin-directory-toolbar"><label>태그<select aria-label="목록 태그 필터" value={tagFilter} onChange={e=>setTagFilter(e.target.value)}><option value="">모든 태그</option>{[...new Set(cards.flatMap(c=>c.tags??[]))].sort().map(tag=><option key={tag} value={tag}><TagLabel tag={tag}/></option>)}</select></label><label>정렬<select aria-label="카드 정렬" value={listSort} onChange={e=>setListSort(e.target.value)}><option value="updated">최근 수정</option><option value="name">이름</option><option value="cost">비용</option></select></label></div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-black/40 p-3 text-xs">
        <button type="button" onClick={() => void runEffectAudit()} disabled={auditing} data-testid="button-audit-card-effects" className="rounded border border-amber-700 px-3 py-2 font-bold text-amber-300 disabled:opacity-40">
          {auditing ? "효과 점검 중..." : "카드 효과 문구·설정 점검"}
        </button>
        {auditResults && <>
          <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)} aria-label="효과 점검 결과 필터" className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2" data-testid="select-effect-audit-filter">
            <option value="">모든 점검 결과</option>
            <option value="missing">설정 누락 의심 ({Object.values(auditResults).filter((result) => result.status === "missing").length})</option>
            <option value="review">직접 확인 필요 ({Object.values(auditResults).filter((result) => result.status === "review").length})</option>
            <option value="aligned">문구·설정 일치 (경기 검증 필요)</option>
          </select>
          <span className="text-neutral-400">정적 비교 결과입니다. 실제 경기에서 발동하는지는 별도로 확인해야 합니다. 카드를 수정했다면 다시 점검해 주세요.</span>
        </>}
      </div>

      {(message || error) && (
        <div data-testid="status-card-action" className={`mb-4 whitespace-pre-line rounded border px-3 py-2 text-xs font-bold ${error ? "border-red-900 bg-red-950/50 text-red-300" : "border-emerald-900 bg-emerald-950/50 text-emerald-300"}`}>
          {error || message}
        </div>
      )}

       {createPortal(
         <input
           ref={imageInputRef}
           type="file"
           accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
           className="hidden"
           data-testid="input-card-image"
           onClick={(event) => event.stopPropagation()}
           onChange={(event) => {
             event.preventDefault();
             event.stopPropagation();
             const file = event.target.files?.[0];
             if (file) void uploadImage(file);
           }}
         />,
         document.body,
       )}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 sm:p-4">
          {cards.length > 0 && <div className="admin-card-list grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredAdminCards.slice(listPage*30,(listPage+1)*30).map((card) => (
              <article
                key={card.id}
                role="button"
                tabIndex={0}
                data-testid={`row-card-${card.id}`}
                onClick={() => openEdit(card)}
                onKeyDown={(event) => { if(event.target!==event.currentTarget)return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEdit(card); } }}
                className="admin-card-record group cursor-pointer rounded-xl border border-neutral-800 bg-black/40 p-2 text-left transition hover:-translate-y-1 hover:border-primary/70 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`${card.name} 카드 수정`}
              >
                <div className="relative overflow-hidden rounded-lg bg-neutral-900">
                  <div className="admin-card-thumbnail">{card.imageUrl?<img src={card.imageUrl} loading="lazy" alt=""/>:<span aria-hidden>{card.name.slice(0,1)}</span>}</div>
                  <span className={`absolute left-2 top-2 rounded border px-1.5 py-1 text-[9px] font-black ${statusClass(card.status)}`}>{statusLabel(card.status)}</span>
                </div>
                <div className="mt-2 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="break-words text-sm font-black text-white">{card.name}</h3>
                    <span className="shrink-0 text-[10px] font-bold text-amber-300">{CARD_RARITY_LABELS[normalizeCardRarity(card.rarity)]}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-500">{card.cardType === "WRESTLER" ? "선수" : "기술"} · 비용 {card.cost} · {card.attack}/{card.health} · v{card.version}</p>
                  {auditResults?.[card.id] && auditResults[card.id].status !== "none" && <p data-testid={`effect-audit-${card.id}`} title={auditResults[card.id].reason} className={`mt-1 text-[10px] font-bold ${auditResults[card.id].status === "missing" ? "text-red-300" : auditResults[card.id].status === "review" ? "text-amber-300" : "text-emerald-300"}`}>
                    {auditResults[card.id].status === "missing" ? "⚠ 설정 누락 의심" : auditResults[card.id].status === "review" ? "? 직접 확인 필요" : "✓ 정적 검사 통과 · 실제 경기 확인 필요"} · {auditResults[card.id].reason}
                  </p>}
                  {(card.isToken || card.isChampionToken) && <p className="mt-1 text-[10px] font-bold text-primary">{card.isChampionToken ? "챔피언 토큰" : "토큰"}</p>}
                  {actionErrorCardId === card.id && error && <p role="alert" className="mt-2 whitespace-pre-line rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200">{error}</p>}
                </div>
                <div className="admin-card-actions mt-3" onClick={(event) => event.stopPropagation()}><details><summary>관리 작업</summary><div className="flex flex-wrap gap-2"><button type="button" disabled={busyId !== null || isLoading || excludedDraftCardIds === null} aria-pressed={excludedDraftCardIds?.includes(card.id) ?? false} title="새 드래프트의 카드 선택 후보에서만 제외합니다. 기존 경기와 카드 생성 효과에는 영향을 주지 않습니다." onClick={() => void toggleDraftSelection(card)} data-testid={`button-draft-selection-${card.id}`} className="rounded border border-amber-800 px-2 py-1.5 text-[10px] font-bold text-amber-300 disabled:opacity-40">{excludedDraftCardIds?.includes(card.id) ? "드래프트 선택에 다시 표시" : "드래프트 선택에서 숨기기"}</button><button type="button" onClick={() => openEdit(card)} data-testid={`button-edit-card-${card.id}`} className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-1.5 text-[10px] font-bold hover:border-primary hover:text-primary"><FilePenLine className="h-3 w-3" /> 수정</button><button type="button" onClick={() => navigate(`${ROUTES.MAIN_MENU}?source=admin&testCardId=${encodeURIComponent(card.id)}`)} data-testid={`button-test-card-${card.id}`} className="rounded border border-sky-700 px-2 py-1.5 text-[10px] font-bold text-sky-300">테스트 게임</button><button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/duplicate`, `${card.name} Copy를 생성했습니다.`, card.id)} data-testid={`button-duplicate-card-${card.id}`} className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-1.5 text-[10px] font-bold hover:border-primary hover:text-primary disabled:opacity-40"><Copy className="h-3 w-3" /> 복제</button><button type="button" disabled={busyId === card.id} onClick={() => void deleteCard(card)} data-testid={`button-delete-card-${card.id}`} className="flex items-center gap-1 rounded border border-red-900 px-2 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-950 disabled:opacity-40"><Trash2 className="h-3 w-3" /> 삭제</button>{card.status !== "PUBLISHED" && <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/status`, "카드를 공개했습니다.", card.id, { status: "PUBLISHED" })} data-testid={`button-publish-card-${card.id}`} className="flex items-center gap-1 rounded border border-emerald-800 px-2 py-1.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-950 disabled:opacity-40"><CheckCircle2 className="h-3 w-3" /> 공개</button>}{card.status !== "DRAFT" && <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/status`, "카드를 미공개로 전환했습니다.", card.id, { status: "DRAFT" })} data-testid={`button-unpublish-card-${card.id}`} title="일반 배포에서 제외합니다. 기존 보유 및 완전 무작위 효과의 처리 정책은 유지됩니다." className="flex items-center gap-1 rounded border border-amber-800 px-2 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-950 disabled:opacity-40"><EyeOff className="h-3 w-3" /> 미공개</button>}{card.status !== "DISABLED" && <button type="button" disabled={busyId === card.id} onClick={() => mutateCard(`/cards/${card.id}/status`, "카드를 비활성화했습니다.", card.id, { status: "DISABLED" })} data-testid={`button-disable-card-${card.id}`} className="flex items-center gap-1 rounded border border-red-900 px-2 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-950 disabled:opacity-40"><Ban className="h-3 w-3" /> 비활성화</button>}</div></details></div>
              </article>
            ))}
          </div>}
        {!isLoading && (cards.length === 0 || (auditFilter && !cards.some((card) => auditResults?.[card.id]?.status === auditFilter))) && <div data-testid="status-empty-cards" className="p-10 text-center text-sm text-neutral-600">조건에 맞는 카드가 없습니다.</div>}
        {isLoading && <div data-testid="status-loading-cards" className="p-10 text-center text-sm text-neutral-600">카드 목록을 불러오는 중...</div>}
        </div>

<div className="admin-pagination" aria-label="카드 목록 페이지"><button type="button" disabled={!listPage} onClick={()=>setListPage(p=>p-1)}>이전</button><span>{listPage+1} / {Math.max(1,Math.ceil(filteredAdminCards.length/30))} · {filteredAdminCards.length}장</span><button type="button" disabled={(listPage+1)*30>=filteredAdminCards.length} onClick={()=>setListPage(p=>p+1)}>다음</button></div>
      {isFormOpen && (
        <AdminEditorWorkspace title={editingCard ? `${preview.name || '카드'} 편집` : '새 카드 만들기'} description={editingCard ? `현재 버전 v${editingCard.version} · 저장하면 변경 내용이 반영됩니다.` : '기본 정보와 효과를 설정하세요. 새 카드는 미공개로 저장됩니다.'} dirty={adminDraftDirty} isNew={!editingCard} busy={busyId!==null} uploading={isUploadingImage} error={error} onClose={closeForm} onSave={()=>void form.handleSubmit(submitCard,errors=>{const key=Object.keys(errors)[0];setError('입력값을 확인하세요. 이름과 수치 항목은 필수입니다.');requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-admin-workbench] [name="${key}"]`)?.dispatchEvent(new CustomEvent('ko-admin-reveal-field',{bubbles:true})));})()}>
             <div className="admin-workbench-columns">
             <form onSubmit={form.handleSubmit(submitCard,errors=>{const key=Object.keys(errors)[0];setError('입력값을 확인하세요. 이름과 수치 항목은 필수입니다.');requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-admin-workbench] [name="${key}"]`)?.dispatchEvent(new CustomEvent('ko-admin-reveal-field',{bubbles:true})));})}>
             <div className="admin-workbench-fields grid gap-4 md:grid-cols-2">
               <AdminEditorSections panels={[{"id":"admin-card-manager-0","label":"기본 정보"},{"id":"admin-card-manager-1","label":"효과 및 조건"},{"id":"admin-card-manager-2","label":"태그 · 키워드"},{"id":"admin-card-manager-3","label":"이미지"},{"id":"admin-card-manager-4","label":"대사 · 음악"}]}>{[<><label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">이름</span><input {...form.register("name", { required: true })} aria-invalid={Boolean(form.formState.errors.name)} data-testid="input-card-name" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
<label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">카드 종류</span><select {...form.register("cardType")} data-testid="input-card-card-type" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select></label>
<label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">카드 등급</span><select {...form.register("rarity")} data-testid="input-card-rarity" className="w-full rounded border border-neutral-700 bg-neutral-900">{allowedCardRarities(previewCardType).map((rarity) => <option key={rarity} value={rarity}>{CARD_RARITY_LABELS[rarity]}</option>)}</select></label>
<div className="grid grid-cols-3 gap-2">
                {(["cost", "attack", "health"] as const).map((field) => <label key={field} className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">{{ cost: "비용", attack: "공격력", health: "체력" }[field]}</span><input type="number" min={0} max={999} {...form.register(field, { required: true, valueAsNumber: true })} aria-invalid={Boolean(form.formState.errors[field])} data-testid={`input-card-${field}`} className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 outline-none focus:border-primary" /></label>)}
              </div>
<label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isToken")} data-testid="input-card-token" /> 토큰 카드</label>
<label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isChampionToken")} data-testid="input-card-champion-token" /> 챔피언 토큰</label>
<label className="flex items-center gap-2 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-sm"><input type="checkbox" {...form.register("isStarterGrant")} /> 신규 계정 Starter 카드</label></>,
<><label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">카드 효과 설명</span><textarea {...form.register("text", { onChange: () => { form.setValue("effectId", ""); form.setValue("effectConfig", JSON.stringify(keywordSettingsAfterTextEdit(form.getValues("effectConfig")))); } })} rows={3} data-testid="input-card-text" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>

{preview.keywords.includes('CONDITION') && <fieldset className="md:col-span-2"><legend>카드 사용 조건</legend><ChampionQuestConditionEditor value={validChampionQuestCondition(keywordConfig.playCondition) ? keywordConfig.playCondition : {type:'TURN',turn:5}} onChange={v=>updateKeywordConfig('playCondition',v)}/>{!validChampionQuestCondition(keywordConfig.playCondition)&&<button type="button" className="min-h-11 p-2" onClick={()=>updateKeywordConfig('playCondition',{type:'TURN',turn:5})}>전체 5턴 이상 조건 적용</button>}</fieldset>}
<div className="space-y-2 md:col-span-2">
                 <details className="rounded border border-neutral-800 bg-neutral-900/50 p-3">
                   <summary className="cursor-pointer text-xs font-bold text-neutral-500">고급 효과 설정 (선택 사항)</summary>
                   <div className="mt-3 grid gap-3 md:grid-cols-2">
                     <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 ID</span><input {...form.register("effectId")} placeholder="예: STRUCTURED_EFFECTS_V1 또는 SCRIPT_V1" data-testid="input-card-effect-id" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
                     <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 설정 JSON</span><textarea {...form.register("effectConfig")} rows={3} data-testid="input-card-effect-config" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs outline-none focus:border-primary" /></label>
                   </div>
                 </details>
               </div></>,
<><fieldset className="space-y-2 md:col-span-2"><legend className="text-xs font-bold text-neutral-400">키워드</legend><div className="flex flex-wrap gap-2">{KEYWORDS.map((keyword) => {
                 const numeric = keyword === 'ARMOR' ? {key:'armor',label:'피해 감소량',aria:'아머 피해 감소량',min:0}
                   : keyword === 'DODGE' ? {key:'dodgeCharges',label:'회피 횟수',aria:'회피 가능 횟수',min:1}
                   : keyword === 'COUNTDOWN' ? {key:'countdownTurns',label:'생존 턴 수',aria:'카운트다운 생존 턴 수',min:1} : undefined;
                 return <div key={keyword} className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" value={keyword} {...form.register("keywords", { onChange:event=>{if(event.target.checked && numeric && keywordConfig[numeric.key]===undefined) updateKeywordConfig(numeric.key,1);} })} data-testid={`input-keyword-${keyword}`} />{KEYWORD_LABELS[keyword]}</label>{preview.keywords.includes(keyword) && numeric && <label className="flex items-center gap-2"><span>{numeric.label}</span><input aria-label={numeric.aria} data-testid={`input-keyword-${keyword}-amount`} type="number" min={numeric.min} max={999} step={1} className="min-h-11 w-20 rounded border border-neutral-700 bg-black px-2" value={Number.isSafeInteger(keywordConfig[numeric.key]) ? Number(keywordConfig[numeric.key]) : numeric.min} onChange={event=>{const value=Number(event.target.value);if(Number.isSafeInteger(value))updateKeywordConfig(numeric.key,Math.min(999,Math.max(numeric.min,value)));}} /></label>}</div>;
               })}</div>{preview.keywords.includes('COUNTDOWN') && <p className="text-xs text-neutral-400">다음 자기 턴 시작부터 1씩 감소하고, 0이 되면 한 번 발동합니다. 실제 효과 설정에서 발동 시점을 카운트다운(COUNTDOWN)으로 설정하세요.</p>}</fieldset>
<fieldset className="space-y-2 md:col-span-2">
                  <legend className="text-xs font-bold text-neutral-400">태그</legend>
                  <div className="flex flex-wrap gap-2">
                    {(preview.tags ?? []).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-1 text-xs font-bold text-amber-200">
                        <TagLabel tag={tag}/>
                        <button type="button" onClick={() => removeTag(tag)} aria-label={`${tag} 태그 삭제`} className="rounded-full p-0.5 hover:bg-amber-200/20">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <div className="flex min-w-[220px] flex-1 gap-2">
                      <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addTag();
                          }
                        }}
                        placeholder="태그 입력"
                        data-testid="input-card-tag"
                        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs outline-none focus:border-primary disabled:opacity-40"
                      />
                      <button type="button" onClick={addTag} disabled={!tagDraft.trim()} data-testid="button-add-card-tag" className="rounded border border-neutral-700 px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40">
                        <Plus className="mr-1 inline h-3 w-3" /> 추가
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-600">개수 제한 없음 · 앞뒤 공백은 저장 시 제거됩니다.</p>
                </fieldset></>,
<><div className="space-y-2 rounded border border-neutral-800 bg-neutral-900/50 p-3 md:col-span-2">
                 <div className="text-xs font-bold text-neutral-400">카드 이미지</div>
                 <div className="flex flex-wrap gap-2">
                   <button
                     type="button"
                     disabled={isUploadingImage}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        imageInputRef.current?.click();
                      }}
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
                  <div className="mt-3 space-y-3 border-t border-neutral-800 pt-3">
                    <div className="text-xs font-bold text-neutral-400">이미지 표시 설정</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ["COVER", "채우기"],
                        ["CONTAIN", "전체 보기"],
                        ["CUSTOM", "수동 조절"],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setImageDisplaySettings((current) => ({ ...current, imageDisplayMode: mode }))}
                          className={`rounded border px-2 py-2 text-xs font-bold ${
                            imageDisplaySettings.imageDisplayMode === mode
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                          }`}
                          data-testid={`button-image-mode-${mode.toLowerCase()}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <ImageDisplaySlider
                      label="확대/축소"
                      value={imageDisplaySettings.imageScale}
                      min={0.5}
                      max={2}
                      step={0.01}
                      displayValue={`${Math.round(imageDisplaySettings.imageScale * 100)}%`}
                      onChange={(value) => setImageDisplaySettings((current) => ({ ...current, imageScale: value }))}
                      testId="input-image-scale"
                    />
                    <ImageDisplaySlider
                      label="좌우 위치"
                      value={imageDisplaySettings.imagePositionX}
                      min={0}
                      max={100}
                      step={1}
                      displayValue={`${Math.round(imageDisplaySettings.imagePositionX)}`}
                      onChange={(value) => setImageDisplaySettings((current) => ({ ...current, imagePositionX: value }))}
                      testId="input-image-position-x"
                    />
                    <ImageDisplaySlider
                      label="상하 위치"
                      value={imageDisplaySettings.imagePositionY}
                      min={0}
                      max={100}
                      step={1}
                      displayValue={`${Math.round(imageDisplaySettings.imagePositionY)}`}
                      onChange={(value) => setImageDisplaySettings((current) => ({ ...current, imagePositionY: value }))}
                      testId="input-image-position-y"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setImageDisplaySettings({ ...DEFAULT_IMAGE_DISPLAY_SETTINGS })}
                        className="flex items-center gap-1.5 rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-bold text-neutral-300 hover:border-primary hover:text-primary"
                        data-testid="button-reset-image-position"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> 이미지 위치 초기화
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageDisplaySettings({
                          imageDisplayMode: "CONTAIN",
                          imageScale: 1,
                          imagePositionX: 50,
                          imagePositionY: 50,
                        })}
                        className="flex items-center gap-1.5 rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-bold text-neutral-300 hover:border-primary hover:text-primary"
                        data-testid="button-fit-image"
                      >
                        <Maximize2 className="h-3.5 w-3.5" /> 이미지 전체 보기
                      </button>
                    </div>
                  </div>
               </div></>,
<>{preview.cardType === "WRESTLER" && <label className="space-y-1.5 md:col-span-2">
                 <span className="text-xs font-bold text-amber-200">등장·소환 대사 (선택)</span>
                 <input {...form.register("summonLine", { maxLength: 140 })} maxLength={140}
                   placeholder="레전더리·토큰 등에 대사를 넣어 주세요" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
                 <small className="text-neutral-500">손에서 내거나 효과로 필드에 등장할 때 표시됩니다.</small>
               </label>}
{preview.cardType === "WRESTLER" && (['retireLine', 'destroyLine'] as const).map(key => <label key={key} className="space-y-1.5">
                 <span className="text-xs font-bold text-amber-200">{key === 'retireLine' ? '리타이어 대사' : '파괴 대사'} (선택)</span>
                 <input {...form.register(key, { maxLength: 140 })} data-testid={key + '-input'} maxLength={140} className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
                 <small className="text-neutral-500">{key === 'retireLine' ? '리타이어되어 퇴장할 때 표시됩니다.' : '파괴되어 퇴장할 때 표시됩니다. 비워두면 리타이어 대사를 사용합니다.'}</small>
               </label>)}
<AdminAudioField
                 title="고유 등장 음악"
                 value={entranceAudio}
                 onChange={setEntranceAudio}
                 onError={(messageText) => {
                   setError(messageText);
                   if (messageText) toast({ title: "음악 업로드 실패", description: messageText, variant: "destructive" });
                 }}
                 onMessage={setMessage}
               /></>]}</AdminEditorSections>
              </div>
              <div className="admin-editor-footer flex justify-end gap-2 border-t border-neutral-800 pt-4 md:col-span-2">
                  {editingCard && <button type="button" onClick={() => navigate(`${ROUTES.MAIN_MENU}?source=admin&testCardId=${encodeURIComponent(editingCard.id)}`)} className="rounded border border-sky-700 px-4 py-2 text-sm font-bold text-sky-300" data-testid="button-test-card">테스트 게임에서 확인</button>}
                 <button type="button" disabled={busyId!==null||isUploadingImage} onClick={closeForm} className="rounded border border-neutral-700 px-4 py-2 text-sm font-bold" data-testid="button-cancel-card">취소</button>
                 <button type="submit" disabled={busyId !== null || isUploadingImage} className="rounded bg-primary px-5 py-2 text-sm font-black text-black disabled:opacity-40" data-testid="button-save-card">{editingCard ? "수정 저장" : "미공개로 생성"}</button>
              </div>
            </form>
             <aside className="admin-editor-preview" aria-label="카드 미리보기">
               <h4>실시간 카드 미리보기</h4>
               <AdminCardPreview
                 name={preview.name}
                 cardType={preview.cardType}
                 cost={Number(preview.cost) || 0}
                 attack={Number(preview.attack) || 0}
                 health={Number(preview.health) || 0}
                 text={preview.text}
                  rarity={preview.rarity}
                 imageUrl={localPreviewUrl ?? imageUrl}
                  imageDisplaySettings={imageDisplaySettings}
                  onImagePositionChange={(position) => setImageDisplaySettings((current) => ({ ...current, ...position }))}
               />
               <p className="mt-4 text-center text-[10px] leading-relaxed text-neutral-600">미리보기 전용 카드입니다.<br />게임 액션은 실행되지 않습니다.</p>
             </aside>
             </div>
        </AdminEditorWorkspace>
      )}
    </div>
  );
}

function AdminCardPreview({
  name,
  cardType,
  cost,
  attack,
  health,
  text,
  imageUrl,
  rarity,
  imageDisplaySettings,
  onImagePositionChange,
}: {
  name: string;
  cardType: CardType;
  cost: number;
  attack: number;
  health: number;
  text: string;
  imageUrl: string | null;
  rarity?: CardRarity;
  imageDisplaySettings: ImageDisplaySettings;
  onImagePositionChange: (
    position: Pick<ImageDisplaySettings, "imagePositionX" | "imagePositionY">,
  ) => void;
}) {
  return (
    <CardRenderer
      name={name || "카드 이름"}
      cardType={cardType}
      cost={cost}
      attack={attack}
      health={health}
      rulesText={text || "효과 없음"}
      imageUrl={imageUrl}
      rarity={rarity}
      size="admin"
      className="mx-auto h-[336px] w-[240px] shadow-[0_15px_40px_rgba(0,0,0,0.7)]"
      imageDisplaySettings={imageDisplaySettings}
      interactiveArtwork
      onImagePositionChange={onImagePositionChange}
    />
  );
}

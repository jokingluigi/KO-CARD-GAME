import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Ban,
  CheckCircle2,
  Copy,
  FilePenLine,
  Plus,
  Search,
  X,
} from "lucide-react";

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
  const form = useForm<CardFormValues>({ defaultValues: EMPTY_CARD });

  const loadCards = useCallback(async () => {
    setIsLoading(true);
    setError("");
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
    setError("");
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
      setIsFormOpen(false);
      await loadCards();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "카드를 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
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
              <tr key={card.id} data-testid={`row-card-${card.id}`} className="bg-neutral-950 hover:bg-neutral-900/60">
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
                <td className="px-3 py-3">
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
          <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black">{editingCard ? "카드 수정" : "새 카드 추가"}</h3>
                <p className="mt-1 text-xs text-neutral-500">{editingCard ? `저장하면 v${editingCard.version + 1}로 증가합니다.` : "새 카드는 DRAFT 상태로 생성됩니다."}</p>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} data-testid="button-close-card-form" className="rounded p-2 text-neutral-500 hover:bg-neutral-800 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={form.handleSubmit(submitCard)} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">이름</span><input {...form.register("name", { required: true })} data-testid="input-card-name" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">카드 종류</span><select {...form.register("cardType")} data-testid="input-card-card-type" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select></label>
              <div className="grid grid-cols-3 gap-2">
                {(["cost", "attack", "health"] as const).map((field) => <label key={field} className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">{{ cost: "비용", attack: "공격력", health: "체력" }[field]}</span><input type="number" min={0} max={999} {...form.register(field, { required: true, valueAsNumber: true })} data-testid={`input-card-${field}`} className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 outline-none focus:border-primary" /></label>)}
              </div>
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-neutral-400">카드 텍스트</span><textarea {...form.register("text")} rows={3} data-testid="input-card-text" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
              <fieldset className="space-y-2 md:col-span-2"><legend className="text-xs font-bold text-neutral-400">키워드</legend><div className="flex flex-wrap gap-2">{KEYWORDS.map((keyword) => <label key={keyword} className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs"><input type="checkbox" value={keyword} {...form.register("keywords")} data-testid={`input-keyword-${keyword}`} />{keyword}</label>)}</div></fieldset>
              <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isToken")} data-testid="input-card-token" /> 토큰 카드</label>
              <label className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm"><input type="checkbox" {...form.register("isChampionToken")} data-testid="input-card-champion-token" /> 챔피언 토큰</label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 ID</span><input {...form.register("effectId")} placeholder="예: ACTIVE_GAIN_GOLD" data-testid="input-card-effect-id" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-primary" /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-neutral-400">효과 설정 JSON</span><textarea {...form.register("effectConfig")} rows={4} data-testid="input-card-effect-config" className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs outline-none focus:border-primary" /></label>
              {error && <p role="alert" className="md:col-span-2 rounded border border-red-900 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4 md:col-span-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="rounded border border-neutral-700 px-4 py-2 text-sm font-bold" data-testid="button-cancel-card">취소</button>
                <button type="submit" disabled={busyId !== null} className="rounded bg-primary px-5 py-2 text-sm font-black text-black disabled:opacity-40" data-testid="button-save-card">{editingCard ? "수정 저장" : "DRAFT로 생성"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
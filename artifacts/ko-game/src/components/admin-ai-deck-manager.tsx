import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Copy, Plus, Save, Search, Trash2, WandSparkles } from "lucide-react";
import {
  deleteAdminAIDeck,
  duplicateAdminAIDeck,
  fetchAdminAIDeckOptions,
  fetchAdminAIDecks,
  saveAdminAIDeck,
  setAdminAIDeckEnabled,
  testAdminAIDeck,
  type AIDeck,
  type AIDeckCard,
  type AIDeckOptions,
} from "@/lib/ai-decks-client";
import { ROUTES } from "@/lib/routes";

type Props = { onUnauthorized: () => void };
type FilterType = "ALL" | "WRESTLER" | "TECHNIQUE";
type StatusFilter = "ALL" | "PUBLISHED" | "DRAFT";
type Draft = {
  id?: string;
  name: string;
  description: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  enabled: boolean;
  displayOrder: number;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  championDefinitionId: null,
  cardDefinitionIds: [],
  enabled: false,
  displayOrder: 0,
};

function draftFromDeck(deck: AIDeck): Draft {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    championDefinitionId: deck.championDefinitionId,
    cardDefinitionIds: deck.cardDefinitionIds,
    enabled: deck.enabled,
    displayOrder: deck.displayOrder,
  };
}

export function AdminAIDeckManager({ onUnauthorized }: Props) {
  const [, navigate] = useLocation();
  const [decks, setDecks] = useState<AIDeck[]>([]);
  const [options, setOptions] = useState<AIDeckOptions | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [championSearch, setChampionSearch] = useState("");
  const [championStatus, setChampionStatus] = useState<StatusFilter>("ALL");
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [filterRarity, setFilterRarity] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("ALL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const [deckResult, optionResult] = await Promise.all([fetchAdminAIDecks(), fetchAdminAIDeckOptions()]);
      setDecks(deckResult.decks);
      setOptions(optionResult);
    } catch (error) {
      if (error instanceof Error && /로그인|관리자/.test(error.message)) onUnauthorized();
      setMessage(error instanceof Error ? error.message : "AI 덱 데이터를 불러오지 못했습니다.");
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (options?.cards ?? []).filter((card) =>
      (draft.cardDefinitionIds.includes(card.id) || (
        !card.isToken &&
        !card.isChampionToken &&
        card.status !== "DISABLED"
      )) &&
      (filterType === "ALL" || card.cardType === filterType) &&
      (filterRarity === "ALL" || card.rarity === filterRarity) &&
      (filterStatus === "ALL" || card.status === filterStatus) &&
      (!normalizedSearch || card.name.toLowerCase().includes(normalizedSearch)),
    );
  }, [draft.cardDefinitionIds, filterRarity, filterStatus, filterType, options?.cards, search]);

  const filteredChampions = useMemo(() => {
    const normalizedSearch = championSearch.trim().toLowerCase();
    return (options?.champions ?? []).filter((champion) =>
      champion.status !== "DISABLED" &&
      (championStatus === "ALL" || champion.status === championStatus) &&
      (!normalizedSearch || champion.name.toLowerCase().includes(normalizedSearch)),
    );
  }, [championSearch, championStatus, options?.champions]);

  const cardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    draft.cardDefinitionIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    return counts;
  }, [draft.cardDefinitionIds]);
  const selectedDeck = draft.id ? decks.find((deck) => deck.id === draft.id) : undefined;

  function addCard(card: AIDeckCard) {
    const count = cardCounts.get(card.id) ?? 0;
    const maxCopies = card.rarity === "LEGENDARY" ? 1 : 2;
    if (
      draft.cardDefinitionIds.length >= (options?.maxCardCount ?? 25) ||
      card.isToken ||
      card.isChampionToken ||
      card.status === "DISABLED" ||
      count >= maxCopies
    ) return;
    setDraft((current) => ({ ...current, cardDefinitionIds: [...current.cardDefinitionIds, card.id] }));
  }

  function removeCard(card: AIDeckCard) {
    const index = draft.cardDefinitionIds.indexOf(card.id);
    if (index < 0) return;
    setDraft((current) => ({
      ...current,
      cardDefinitionIds: [...current.cardDefinitionIds.slice(0, index), ...current.cardDefinitionIds.slice(index + 1)],
    }));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await saveAdminAIDeck(draft);
      setDecks((current) => {
        const without = current.filter((deck) => deck.id !== result.deck.id);
        return [...without, result.deck].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
      });
      setDraft(draftFromDeck(result.deck));
      setMessage(result.deck.isValid ? "AI 덱을 저장했습니다." : `저장했지만 유효하지 않습니다: ${result.deck.invalidReasons.join(" ")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 덱을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(deck: AIDeck) {
    setBusy(true);
    try {
      const result = await setAdminAIDeckEnabled(deck.id, !deck.enabled);
      setDecks((current) => current.map((item) => item.id === deck.id ? result.deck : item));
      if (draft.id === deck.id) setDraft(draftFromDeck(result.deck));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 덱 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(deck: AIDeck) {
    setBusy(true);
    try {
      const result = await duplicateAdminAIDeck(deck.id);
      setDecks((current) => [...current, result.deck]);
      setDraft(draftFromDeck(result.deck));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 덱을 복제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(deck: AIDeck) {
    if (!window.confirm(`'${deck.name}' AI 덱을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await deleteAdminAIDeck(deck.id);
      setDecks((current) => current.filter((item) => item.id !== deck.id));
      if (draft.id === deck.id) setDraft(emptyDraft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 덱을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function test(deck: AIDeck) {
    setBusy(true);
    try {
      await testAdminAIDeck(deck.id);
      navigate(`${ROUTES.AI_MATCH}?source=admin&aiDeckId=${encodeURIComponent(deck.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 덱 테스트를 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">AI DECKS</p>
        <h2 className="mt-2 text-2xl font-black">AI 덱 관리</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">카드와 Champion Definition ID를 조합해 실제 게임 엔진으로 테스트할 AI 덱을 관리합니다.</p>
      </div>

      {message && <p className="rounded border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-3">
          <button type="button" onClick={() => setDraft(emptyDraft)} className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-black">
            <Plus className="h-4 w-4" /> 새 AI 덱
          </button>
          {decks.map((deck) => (
            <button key={deck.id} type="button" onClick={() => setDraft(draftFromDeck(deck))} className={`w-full rounded border p-4 text-left ${draft.id === deck.id ? "border-primary bg-primary/10" : "border-neutral-800 bg-black/30"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-black">{deck.name}</span>
                <span className={`text-[10px] font-black ${deck.enabled ? "text-emerald-300" : "text-neutral-500"}`}>{deck.enabled ? "활성" : "비활성"}</span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">{deck.champion?.name ?? "Champion 없음"} · {deck.cardDefinitionIds.length}장</p>
              {!deck.isValid && <p className="mt-2 text-xs font-bold text-red-300">INVALID · {deck.invalidReasons[0]}</p>}
            </button>
          ))}
          {decks.length === 0 && <p className="rounded border border-dashed border-neutral-800 p-5 text-center text-sm text-neutral-500">등록된 AI 덱이 없습니다.</p>}
        </div>

        <div className="space-y-5 rounded-xl border border-neutral-800 bg-black/30 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">이름<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5" placeholder="예: Rush Pressure" /></label>
            <label className="text-sm font-bold">Champion
              <div className="mt-1 flex gap-1">
                <input value={championSearch} onChange={(event) => setChampionSearch(event.target.value)} placeholder="Champion 검색" className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5" />
                <select value={championStatus} onChange={(event) => setChampionStatus(event.target.value as StatusFilter)} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2.5 text-xs"><option value="ALL">전체</option><option value="PUBLISHED">공개</option><option value="DRAFT">DRAFT</option></select>
              </div>
              <select value={draft.championDefinitionId ?? ""} onChange={(event) => setDraft({ ...draft, championDefinitionId: event.target.value || null })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5"><option value="">Champion 선택</option>{filteredChampions.map((champion) => <option key={champion.id} value={champion.id}>{champion.name}{champion.status === "DRAFT" ? " [DRAFT]" : ""}</option>)}</select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_120px]">
            <label className="text-sm font-bold">설명<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1 min-h-20 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5" /></label>
            <label className="text-sm font-bold">순서<input type="number" value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2.5" /></label>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-950 p-3">
            <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-600" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="카드 이름 검색" className="w-full rounded border border-neutral-700 bg-black py-2 pl-9 pr-3 text-sm" /></div>
            <select value={filterType} onChange={(event) => setFilterType(event.target.value as FilterType)} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm"><option value="ALL">전체 타입</option><option value="WRESTLER">WRESTLER</option><option value="TECHNIQUE">TECHNIQUE</option></select>
            <select value={filterRarity} onChange={(event) => setFilterRarity(event.target.value)} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm"><option value="ALL">전체 등급</option><option value="NORMAL">NORMAL</option><option value="LEGENDARY">LEGENDARY</option></select>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as StatusFilter)} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm"><option value="ALL">전체 상태</option><option value="PUBLISHED">공개</option><option value="DRAFT">미공개</option></select>
            <span className={`ml-auto text-sm font-black ${draft.cardDefinitionIds.length >= (options?.minCardCount ?? 20) && draft.cardDefinitionIds.length <= (options?.maxCardCount ?? 30) ? "text-emerald-300" : "text-amber-300"}`}>{draft.cardDefinitionIds.length}장 / {options?.minCardCount ?? 20}~{options?.maxCardCount ?? 30}</span>
          </div>

          <div className="grid max-h-[480px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredCards.map((card) => {
              const count = cardCounts.get(card.id) ?? 0;
              const maxCopies = card.rarity === "LEGENDARY" ? 1 : 2;
              const canAdd = draft.cardDefinitionIds.length < (options?.maxCardCount ?? 25) &&
                !card.isToken && !card.isChampionToken && card.status !== "DISABLED" && count < maxCopies;
              return (
                <div key={card.id} className={`rounded border p-3 transition ${count ? "border-primary bg-primary/10" : "border-neutral-800 bg-neutral-950"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black">{card.name} {card.status === "DRAFT" && <span className="ml-1 rounded border border-amber-700 px-1 text-[10px] text-amber-300">DRAFT</span>}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={!count || busy} onClick={() => removeCard(card)} className="rounded border border-neutral-700 px-2 py-0.5 text-xs disabled:opacity-40">−</button>
                      <span className="min-w-5 text-center text-xs font-black text-primary">{count}</span>
                      <button type="button" disabled={!canAdd || busy} onClick={() => addCard(card)} className="rounded border border-neutral-700 px-2 py-0.5 text-xs disabled:opacity-40">+</button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{card.cardType} · {card.rarity} · 비용 {card.cost} · {card.attack}/{card.health}</p>
                </div>
              );
            })}
          </div>
          {draft.cardDefinitionIds.some((id) => !options?.cards.some((card) => card.id === id)) && (
            <div className="rounded border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">
              삭제된 카드 Definition이 포함되어 있습니다. 저장하려면 아래 ID를 제거하세요.
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.cardDefinitionIds.filter((id) => !options?.cards.some((card) => card.id === id)).map((id) => (
                  <button key={id} type="button" onClick={() => setDraft({ ...draft, cardDefinitionIds: draft.cardDefinitionIds.filter((cardId) => cardId !== id) })} className="rounded border border-red-800 px-2 py-1 font-mono hover:bg-red-900/40">{id} ×</button>
                ))}
              </div>
            </div>
          )}
          {selectedDeck && selectedDeck.requiredCardDefinitionIds.some((id) => !options?.cards.some((card) => card.id === id)) && (
            <div className="rounded border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">
              카드 효과 또는 Champion Token 참조가 누락되었습니다. 아래 ID를 확인하세요. 자동 대체하지 않습니다.
              <div className="mt-2 flex flex-wrap gap-2 font-mono">
                {selectedDeck.requiredCardDefinitionIds.filter((id) => !options?.cards.some((card) => card.id === id)).map((id) => <span key={id} className="rounded border border-red-800 px-2 py-1">{id}</span>)}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
            <button type="button" disabled={busy} onClick={() => void save()} className="flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"><Save className="h-4 w-4" /> 저장</button>
            {draft.id && <><button type="button" disabled={busy} onClick={() => { const deck = decks.find((item) => item.id === draft.id); if (deck) void test(deck); }} className="flex items-center gap-2 rounded border border-amber-600 px-4 py-2.5 text-sm font-black text-amber-300 disabled:opacity-50"><WandSparkles className="h-4 w-4" /> AI 테스트</button><button type="button" disabled={busy} onClick={() => { const deck = decks.find((item) => item.id === draft.id); if (deck) void toggleEnabled(deck); }} className="rounded border border-emerald-700 px-4 py-2.5 text-sm font-black text-emerald-300 disabled:opacity-50">{draft.enabled ? "비활성화" : "활성화"}</button><button type="button" disabled={busy} onClick={() => { const deck = decks.find((item) => item.id === draft.id); if (deck) void duplicate(deck); }} className="flex items-center gap-2 rounded border border-neutral-700 px-4 py-2.5 text-sm font-black text-neutral-300 disabled:opacity-50"><Copy className="h-4 w-4" /> 복제</button><button type="button" disabled={busy} onClick={() => { const deck = decks.find((item) => item.id === draft.id); if (deck) void remove(deck); }} className="flex items-center gap-2 rounded border border-red-900 px-4 py-2.5 text-sm font-black text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /> 삭제</button></>}
          </div>
        </div>
      </div>
    </section>
  );
}
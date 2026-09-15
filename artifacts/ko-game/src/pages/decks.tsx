import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, CirclePlus, Minus, Plus, RefreshCw, Search, Shield, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { AuthPage, AuthLoading } from "@/components/auth-page";
import { AltInspectProvider, Inspectable } from "@/components/alt-inspector";
import { CardRenderer } from "@/components/card-renderer";
import { fetchCurrentUser, type AuthUser } from "@/lib/auth-client";
import {
  deleteDeck,
  fetchDeckOptions,
  fetchDecks,
  saveDeck,
  selectDeck,
  type Deck,
  type DeckCard,
  type DeckChampion,
} from "@/lib/decks-client";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";
type CardFilter = "ALL" | "WRESTLER" | "TECHNIQUE";

const EMPTY_DECK_NAME = "새로운 전략";
const MAX_CARD_COPIES = 2;
const MAX_LEGENDARY_CARDS = 3;

function cardSettings(card: DeckCard) {
  return {
    imageDisplayMode: card.imageDisplayMode as "COVER" | "CONTAIN" | "CUSTOM",
    imageScale: card.imageScale,
    imagePositionX: card.imagePositionX,
    imagePositionY: card.imagePositionY,
  };
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function cardLimitReason(card: DeckCard, count: number, legendaryCount: number): string | undefined {
  if (card.rarity === "LEGENDARY") {
    if (count >= 1) return "레전더리 동일 카드 1장 제한";
    if (legendaryCount >= MAX_LEGENDARY_CARDS) return "레전더리 총 3장 제한";
  } else if (count >= MAX_CARD_COPIES) {
    return "동일 카드 최대 2장";
  }
  return undefined;
}

function replaceDeck(list: Deck[], next: Deck) {
  const exists = list.some((deck) => deck.id === next.id);
  return exists ? list.map((deck) => (deck.id === next.id ? next : deck)) : [...list, next];
}

function DeckCardVisual({
  card,
  onAdd,
  disabled,
  disabledReason,
}: {
  card: DeckCard;
  onAdd: () => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  return (
    <article className="ko-decks__collection-card" aria-disabled={disabled} data-testid={`card-collection-${card.id}`}>
      <Inspectable
        showOnHover
        content={
          <div className="space-y-3">
            <p className="text-[0.62rem] font-black tracking-[0.18em] text-amber-300">
              {card.cardType} · {card.rarity}
            </p>
            <CardRenderer
              name={card.name}
              cardType={card.cardType}
              cost={card.cost}
              attack={card.attack}
              health={card.health}
              rulesText={card.text}
              imageUrl={card.imageUrl}
              rarity={card.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
              imageDisplaySettings={cardSettings(card)}
              size="detail"
              className="mx-auto w-44"
            />
            <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-300">{card.text || "효과 없음"}</p>
          </div>
        }
      >
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${card.name} 덱에 추가`}
          data-testid={`button-add-card-${card.id}`}
          onClick={() => {
            if (!disabled) onAdd();
          }}
          onKeyDown={(event) => {
            if (!disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onAdd();
            }
          }}
        >
          <CardRenderer
            name={card.name}
            cardType={card.cardType}
            cost={card.cost}
            attack={card.attack}
            health={card.health}
            rulesText={card.text}
            imageUrl={card.imageUrl}
            rarity={card.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
            imageDisplaySettings={cardSettings(card)}
            size="admin"
            showRules={false}
            showStats
            className="w-full"
          />
        </div>
      </Inspectable>
      <button
        type="button"
        className="ko-decks__card-action"
        aria-label={`${card.name} 추가`}
        data-testid={`button-add-card-action-${card.id}`}
        disabled={disabled}
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="ko-decks__card-label" data-testid={`text-card-name-${card.id}`}>{card.name}</p>
      <p className="ko-decks__card-type">
        {card.cardType === "WRESTLER" ? "WRESTLER" : "TECHNIQUE"} · COST {card.cost} · {card.rarity}
      </p>
      {disabledReason && <p className="ko-decks__card-limit">{disabledReason}</p>}
    </article>
  );
}

function ChampionPortrait({ champion }: { champion: DeckChampion }) {
  return (
    <div className="ko-decks__champion-art" data-testid={`img-champion-${champion.id}`}>
      {champion.imageUrl ? (
        <img
          src={champion.imageUrl}
          alt={`${champion.name} 챔피언 초상`}
          className="aspect-[4/5] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/5] items-center justify-center bg-[#211b16] text-center font-display text-[9px] font-bold tracking-[0.12em] text-[#b28a47]">
          CHAMPION
        </div>
      )}
    </div>
  );
}

function DeckSkeleton() {
  return (
    <main className="ko-decks" aria-busy="true">
      <div className="ko-decks__wrap">
        <div className="ko-decks__skeleton" />
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div className="ko-decks__skeleton" />
          <div className="ko-decks__skeleton md:col-span-2" />
        </div>
      </div>
    </main>
  );
}

export default function Decks() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [options, setOptions] = useState<{ cards: DeckCard[]; champions: DeckChampion[] }>({
    cards: [],
    champions: [],
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState(EMPTY_DECK_NAME);
  const [championId, setChampionId] = useState<string | null>(null);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CardFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((result) => {
        if (cancelled) return;
        if (result.authenticated && result.user) {
          setAuthUser(result.user);
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus("unauthenticated");
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openDeck(deck: Deck) {
    setEditingId(deck.id);
    setDeckName(deck.name);
    setChampionId(deck.championDefinitionId);
    setCardIds([...deck.cardDefinitionIds]);
    setStatusMessage("");
    setErrorMessage("");
  }

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([fetchDeckOptions(), fetchDecks()])
      .then(([nextOptions, nextDecks]) => {
        if (cancelled) return;
        setOptions(nextOptions);
        setDecks(nextDecks);
        const initial = nextDecks.find((deck) => deck.isSelected) ?? nextDecks[0];
        if (initial) {
          openDeck(initial);
        } else {
          setEditingId(null);
          setDeckName(EMPTY_DECK_NAME);
          setChampionId(null);
          setCardIds([]);
        }
        setErrorMessage("");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "덱 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const editingDeck = decks.find((deck) => deck.id === editingId) ?? null;
  const cardById = useMemo(() => {
    const map = new Map<string, DeckCard>();
    options.cards.forEach((card) => map.set(card.id, card));
    editingDeck?.cards.forEach((card) => map.set(card.id, card));
    return map;
  }, [editingDeck, options.cards]);
  const championById = useMemo(() => {
    const map = new Map<string, DeckChampion>();
    options.champions.forEach((champion) => map.set(champion.id, champion));
    if (editingDeck?.champion) map.set(editingDeck.champion.id, editingDeck.champion);
    return map;
  }, [editingDeck, options.champions]);
  const selectedChampion = championId ? championById.get(championId) ?? null : null;
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    cardIds.forEach((id) => next.set(id, (next.get(id) ?? 0) + 1));
    return next;
  }, [cardIds]);
  const legendaryCount = useMemo(
    () =>
      cardIds.reduce((total, id) => {
        return total + (cardById.get(id)?.rarity === "LEGENDARY" ? 1 : 0);
      }, 0),
    [cardById, cardIds],
  );
  const missingIds = useMemo(
    () => unique([...(editingDeck?.missingCardDefinitionIds ?? []), ...cardIds.filter((id) => !cardById.has(id))]),
    [cardById, cardIds, editingDeck?.missingCardDefinitionIds],
  );
  const localInvalidReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!selectedChampion) reasons.push("챔피언을 선택해야 합니다.");
    else if (selectedChampion.status !== "PUBLISHED") reasons.push("챔피언이 현재 공개 상태가 아닙니다.");
    if (cardIds.length < 20) reasons.push(`카드가 ${20 - cardIds.length}장 부족합니다.`);
    if (cardIds.length > 30) reasons.push("카드는 최대 30장까지 구성할 수 있습니다.");
    if (missingIds.length > 0) reasons.push(`확인할 수 없는 카드 참조 ${missingIds.length}개가 있습니다.`);
    if (
      cardIds.some((id) => {
        const card = cardById.get(id);
        return !card || card.status !== "PUBLISHED" || card.isToken || card.isChampionToken;
      })
    ) {
      reasons.push("공개된 비토큰 카드만 대표 덱에 사용할 수 있습니다.");
    }
    counts.forEach((count, id) => {
      const card = cardById.get(id);
      if (!card) return;
      if (card.rarity === "LEGENDARY" && count > 1) {
        reasons.push("레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.");
      } else if (card.rarity !== "LEGENDARY" && count > MAX_CARD_COPIES) {
        reasons.push(`같은 카드는 최대 ${MAX_CARD_COPIES}장까지 넣을 수 있습니다.`);
      }
    });
    if (legendaryCount > MAX_LEGENDARY_CARDS) {
      reasons.push(`레전더리 카드는 덱에 총 ${MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`);
    }
    return reasons;
  }, [cardById, cardIds, counts, legendaryCount, missingIds.length, selectedChampion]);
  const isValidForSelection = localInvalidReasons.length === 0;
  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return options.cards.filter((card) => {
      if (card.status !== "PUBLISHED" || card.isToken || card.isChampionToken) return false;
      if (filter !== "ALL" && card.cardType !== filter) return false;
      return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [filter, options.cards, search]);
  const selectedRows = useMemo(
    () =>
      Array.from(counts.entries()).map(([id, count]) => ({
        id,
        count,
        card: cardById.get(id) ?? null,
      })),
    [cardById, counts],
  );
  const serverReasons = unique([...(editingDeck?.invalidReasons ?? []), ...localInvalidReasons]);

  function createDraft() {
    setEditingId(null);
    setDeckName(EMPTY_DECK_NAME);
    setChampionId(null);
    setCardIds([]);
    setStatusMessage("");
    setErrorMessage("");
  }

  function addCard(card: DeckCard) {
    const reason = cardLimitReason(card, counts.get(card.id) ?? 0, legendaryCount);
    if (cardIds.length >= 30 || card.status !== "PUBLISHED" || card.isToken || card.isChampionToken || reason) return;
    setCardIds((current) => [...current, card.id]);
    setStatusMessage(`${card.name} 카드를 한 장 추가했습니다.`);
  }

  function removeCard(id: string) {
    setCardIds((current) => {
      const index = current.indexOf(id);
      if (index < 0) return current;
      return [...current.slice(0, index), ...current.slice(index + 1)];
    });
    setStatusMessage("카드 한 장을 덱에서 뺐습니다.");
  }

  async function handleSave() {
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      setErrorMessage("덱 이름을 입력해주세요.");
      return;
    }
    setIsMutating(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const result = await saveDeck({
        ...(editingId ? { id: editingId } : {}),
        name: trimmedName,
        championDefinitionId: championId,
        cardDefinitionIds: cardIds,
      });
      if (!result.deck) throw new Error("서버가 저장된 덱을 반환하지 않았습니다.");
      setDecks((current) => replaceDeck(current, result.deck!));
      openDeck(result.deck);
      setStatusMessage("전략을 저장했습니다.");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "덱을 저장하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleSelect() {
    if (!editingId || !isValidForSelection) return;
    setIsMutating(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const result = await selectDeck(editingId);
      if (!result.deck) throw new Error("서버가 선택된 덱을 반환하지 않았습니다.");
      const refreshedDecks = await fetchDecks();
      setDecks(refreshedDecks);
      const selected = refreshedDecks.find((deck) => deck.id === result.deck?.id) ?? result.deck;
      openDeck(selected);
      setStatusMessage("대표 덱을 변경했습니다.");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "대표 덱을 변경하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    const targetName = deckName || "이 덱";
    if (!window.confirm(`“${targetName}”을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setIsMutating(true);
    setErrorMessage("");
    try {
      await deleteDeck(editingId);
      const nextDecks = await fetchDecks();
      setDecks(nextDecks);
      createDraft();
      setStatusMessage("덱을 삭제했습니다.");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "덱을 삭제하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  if (authStatus === "checking") return <AuthLoading />;
  if (authStatus === "unauthenticated") {
    return (
      <AuthPage
        onAuthenticated={(user) => {
          setAuthUser(user);
          setAuthStatus("authenticated");
        }}
      />
    );
  }
  if (isLoading) return <DeckSkeleton />;

  return (
    <AltInspectProvider>
      <main className="ko-decks">
      <div className="ko-decks__grain" aria-hidden="true" />
      <div className="ko-decks__wrap">
        <header className="ko-decks__topline">
          <div>
            <p className="ko-decks__eyebrow">Preparation room / {authUser?.nickname}</p>
            <h1 className="ko-decks__title" data-testid="text-page-title">DECK EDITOR</h1>
            <p className="ko-decks__subtitle">
              링에 오르기 전, 한 장씩 작전을 고릅니다. 반복은 허용됩니다. 좋은 한 수를 여러 번 준비하세요.
            </p>
          </div>
          <Link href="/" className="ko-decks__back" data-testid="link-main-menu">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            메인 메뉴
          </Link>
        </header>

        {errorMessage && (
          <div className="ko-decks__error mt-4 flex items-center justify-between gap-4" role="alert" data-testid="status-decks-error">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="ko-decks__mini-button shrink-0"
              data-testid="button-retry-decks"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              다시 시도
            </button>
          </div>
        )}

        <div className="ko-decks__columns">
          <aside className="ko-decks__rail" aria-label="덱 목록">
            <div className="flex items-center justify-between gap-2">
              <p className="ko-decks__section-label">Your plans</p>
              <button type="button" className="ko-decks__mini-button" data-testid="button-create-deck" onClick={createDraft}>
                <CirclePlus className="h-3.5 w-3.5" aria-hidden="true" />
                새 덱
              </button>
            </div>
            <div className="ko-decks__deck-list" data-testid="list-decks">
              {decks.length === 0 ? (
                <div className="ko-decks__empty mt-4">
                  <Shield className="mx-auto h-7 w-7 text-[#a4793a]" aria-hidden="true" />
                  <h2 className="mt-3">첫 작전을 세우세요</h2>
                  <p>새 덱을 만들고, 챔피언과 카드를 고릅니다.</p>
                </div>
              ) : (
                decks.map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    className={`ko-decks__deck-item ${editingId === deck.id ? "ko-decks__deck-item--active" : ""}`}
                    data-testid={`button-open-deck-${deck.id}`}
                    onClick={() => openDeck(deck)}
                  >
                    <span className="min-w-0">
                      <span className="ko-decks__deck-item-name block">{deck.name}</span>
                      <span className="ko-decks__deck-item-meta block">
                        {deck.champion?.name ?? "CHAMPION 없음"} · {deck.cardDefinitionIds.length} CARDS
                      </span>
                      <span className={`ko-decks__deck-item-status ${deck.isValid ? "ko-decks__deck-item-status--valid" : ""}`}>
                         {deck.isValid ? "VALID" : "INVALID"}
                      </span>
                    </span>
                    {deck.isSelected && <Check className="h-4 w-4 shrink-0 text-[#e7b642]" aria-label="대표 덱" />}
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="ko-decks__library" aria-label="카드 컬렉션">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="ko-decks__section-label">Published collection</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#e8e0d4]" data-testid="text-collection-title">
                  CARD LOCKER
                </h2>
              </div>
              <span className="font-display text-xs tracking-[0.12em] text-[#83786e]" data-testid="text-card-result-count">
                {filteredCards.length} DEFINITIONS
              </span>
            </div>
            <div className="ko-decks__toolbar">
              <label className="ko-decks__search">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">카드 검색</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="카드 이름으로 검색"
                  data-testid="input-card-search"
                />
              </label>
              <div className="ko-decks__filters" role="group" aria-label="카드 유형 필터">
                {(["ALL", "WRESTLER", "TECHNIQUE"] as CardFilter[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`ko-decks__filter ${filter === item ? "ko-decks__filter--active" : ""}`}
                    data-testid={`button-filter-${item.toLowerCase()}`}
                    onClick={() => setFilter(item)}
                  >
                    {item === "ALL" ? "ALL" : item}
                  </button>
                ))}
              </div>
            </div>
            {filteredCards.length === 0 ? (
              <div className="ko-decks__empty mt-5" data-testid="empty-card-results">
                <Search className="mx-auto h-7 w-7 text-[#8f6d37]" aria-hidden="true" />
                <h2 className="mt-3">카드가 없습니다</h2>
                <p>검색어 또는 필터를 바꿔보세요.</p>
              </div>
            ) : (
              <div className="ko-decks__card-grid" data-testid="grid-card-collection">
                {filteredCards.map((card) => (
                  <DeckCardVisual
                    key={card.id}
                    card={card}
                    disabled={cardIds.length >= 30 || Boolean(cardLimitReason(card, counts.get(card.id) ?? 0, legendaryCount))}
                    disabledReason={cardLimitReason(card, counts.get(card.id) ?? 0, legendaryCount)}
                    onAdd={() => addCard(card)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="ko-decks__editor" aria-label="현재 덱 편집기">
            <div className="ko-decks__editor-head">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="ko-decks__section-label">Fight plan</p>
                  <label className="sr-only" htmlFor="deck-name">덱 이름</label>
                  <input
                    id="deck-name"
                    className="ko-decks__name-input"
                    value={deckName}
                    maxLength={40}
                    onChange={(event) => setDeckName(event.target.value)}
                    data-testid="input-deck-name"
                  />
                </div>
                {editingDeck?.isSelected && (
                  <span className="mt-5 shrink-0 font-display text-[10px] font-bold tracking-[0.12em] text-[#efc65c]" data-testid="status-selected-deck">
                    SELECTED
                  </span>
                )}
              </div>
            </div>
            <div className="ko-decks__editor-scroll">
              <div className="flex items-center justify-between gap-3">
                <p className="ko-decks__section-label">Champion</p>
                <label className="relative">
                  <span className="sr-only">챔피언 선택</span>
                  <select
                    value={championId ?? ""}
                    onChange={(event) => setChampionId(event.target.value || null)}
                    className="appearance-none border-b border-[#554a3a] bg-transparent py-1 pr-6 text-right text-xs font-bold text-[#cdbb94] outline-none"
                    data-testid="select-champion"
                  >
                    <option value="">챔피언 없음</option>
                    {Array.from(championById.values()).map((champion) => (
                      <option key={champion.id} value={champion.id}>
                        {champion.name}{champion.status !== "PUBLISHED" ? " · 사용 불가" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a98548]" aria-hidden="true" />
                </label>
              </div>
              <div className="ko-decks__champion-slot mt-3" data-testid="panel-selected-champion">
                {selectedChampion ? (
                  <>
                    <ChampionPortrait champion={selectedChampion} />
                    <div className="ko-decks__champion-copy min-w-0">
                      <h3>{selectedChampion.name}</h3>
                      <p>{selectedChampion.description || "이 챔피언의 링 위 계획을 완성하세요."}</p>
                      {selectedChampion.status !== "PUBLISHED" && (
                        <p className="mt-2 flex items-center gap-1 text-[#de8e7f]"><AlertTriangle className="h-3 w-3" /> 공개되지 않은 챔피언</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="col-span-2 py-5 text-center text-xs font-bold text-[#736b62]">챔피언을 선택하세요</p>
                )}
              </div>

              <div className="ko-decks__meter" data-testid="panel-deck-meter">
                <div className="ko-decks__meter-line">
                  <span>FIGHT PLAN / cards</span>
                  <span className="ko-decks__meter-number" data-testid="text-deck-card-count">{cardIds.length} <small className="font-sans text-[0.62rem] text-[#91877b]">/ 30</small></span>
                </div>
                <div className="ko-decks__meter-track" aria-hidden="true">
                  <div className="ko-decks__meter-fill" style={{ width: `${Math.min(100, (cardIds.length / 30) * 100)}%` }} />
                </div>
                {cardIds.length < 20 && (
                  <p className="ko-decks__notice ko-decks__notice--quiet mt-3" data-testid="status-deck-incomplete">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    저장은 가능하지만, 대표 덱으로 선택하려면 카드가 20장 필요합니다.
                  </p>
                )}
              </div>

              {serverReasons.length > 0 && (
                <div className="ko-decks__notice" role="status" data-testid="status-deck-invalid">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{serverReasons.join(" ")}</span>
                </div>
              )}
              {missingIds.length > 0 && (
                <div className="mt-2 text-[0.65rem] font-bold leading-5 text-[#d68b7c]" data-testid="warning-missing-cards">
                  저장된 카드 참조를 찾을 수 없습니다: {missingIds.join(", ")}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="ko-decks__section-label">Cards in plan</p>
                  <span className="text-[0.62rem] font-bold text-[#706b65]">일반 동일 카드 2장 · 레전더리 카드별 1장 / 총 3장</span>
              </div>
              {selectedRows.length === 0 ? (
                <div className="ko-decks__empty mt-3" data-testid="empty-selected-cards">
                  <p>왼쪽 카드 보관함에서 작전을 채우세요.</p>
                </div>
              ) : (
                <div className="ko-decks__selected-list" data-testid="list-selected-cards">
                  {selectedRows.map(({ id, count, card }) => (
                    <div key={id} className="ko-decks__selected-row" data-testid={`row-selected-card-${id}`}>
                      {card ? (
                        <div className="ko-decks__selected-thumb">
                          <CardRenderer
                            name={card.name}
                            cardType={card.cardType}
                            cost={card.cost}
                            attack={card.attack}
                            health={card.health}
                            rulesText={card.text}
                            imageUrl={card.imageUrl}
                            rarity={card.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
                            imageDisplaySettings={cardSettings(card)}
                            size="admin"
                            showRules={false}
                            showStats={false}
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[1060/1484] items-center justify-center bg-[#331d1b] text-[#db8d7c]" title="누락된 카드">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="ko-decks__selected-name">{card?.name ?? `확인할 수 없는 카드 (${id})`}</p>
                        <p className="ko-decks__selected-kind">
                          {card ? `${card.cardType} · COST ${card.cost} · ${card.rarity}` : "MISSING REFERENCE"}
                        </p>
                      </div>
                      <span className="ko-decks__count text-[#d9b04b]" data-testid={`text-card-count-${id}`}>×{count}</span>
                      <button type="button" className="ko-decks__remove" aria-label={`${card?.name ?? id} 한 장 제거`} data-testid={`button-remove-card-${id}`} onClick={() => removeCard(id)}>
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="ko-decks__editor-actions">
              <button type="button" className="ko-decks__primary-action" data-testid="button-save-deck" disabled={isMutating} onClick={handleSave}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {isMutating ? "처리 중..." : "전략 저장"}
              </button>
              <button type="button" className="ko-decks__secondary-action" data-testid="button-select-deck" disabled={isMutating || !editingId || !isValidForSelection} onClick={handleSelect}>
                대표 덱 선택
              </button>
              {editingId && (
                <button type="button" className="ko-decks__danger-action" aria-label="덱 삭제" data-testid="button-delete-deck" disabled={isMutating} onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {statusMessage && <p className="px-[18px] pb-3 text-center text-[0.68rem] font-bold text-[#d5b25b]" role="status" data-testid="status-decks-success">{statusMessage}</p>}
          </section>
        </div>
      </div>
      </main>
    </AltInspectProvider>
  );
}
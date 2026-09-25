import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CirclePlus, Hammer, Minus, Plus, RefreshCw, Search, Shield, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { AuthPage, AuthLoading, AuthRecovery } from "@/components/auth-page";
import { AltInspectProvider, Inspectable } from "@/components/alt-inspector";
import { CardRenderer } from "@/components/card-renderer";
import { CardArtwork } from "@/components/card-artwork";
import { CardDetailDialog } from "@/components/card-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchCurrentUser, type AuthUser } from "@/lib/auth-client";
import { craftCard as requestCardCraft, fetchCollection, type Collection, type CollectionCard } from "@/lib/collection-client";
import {
  deleteDeck,
  fetchDeckOptions,
  fetchDecks,
  saveDeck,
  selectDeck,
  type Deck,
  type DeckCard,
  type DeckChampion,
  type DeckOptions,
  type DeckValidationReason,
} from "@/lib/decks-client";
import { cardTypeLabel, deckValidityLabel, normalizeCardRulesText } from "@/lib/display-labels";
import { DECK_SIZE, MAX_LEGENDARY_CARDS, validateDeckCounts } from "@workspace/game-engine";
import { cardLimitReason, cardOwnershipReason, getDeckCardAction, getDeckCardCountView, MAX_CARD_COPIES } from "./deck-card-availability";

type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error";
type CardFilter = "ALL" | "WRESTLER" | "TECHNIQUE";

const EMPTY_DECK_NAME = "새로운 전략";

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

function uniqueValidationReasons(reasons: DeckValidationReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.reasonCode}:${reason.message}:${(reason.cardDefinitionIds ?? []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validationReason(
  scope: "DECK" | "CARD",
  reasonCode: string,
  message: string,
  cardDefinitionIds?: string[],
  extra?: Pick<DeckValidationReason, "count" | "limit">,
): DeckValidationReason {
  return {
    scope,
    reasonCode,
    message,
    ...(cardDefinitionIds?.length ? { cardDefinitionIds } : {}),
    ...extra,
  };
}

function replaceDeck(list: Deck[], next: Deck) {
  const exists = list.some((deck) => deck.id === next.id);
  return exists ? list.map((deck) => (deck.id === next.id ? next : deck)) : [...list, next];
}

function sameCardIdList(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function DeckCardVisual({
  card,
  onAdd,
  onOpenDetails,
  disabled,
  disabledReason,
  selectedCount,
  unowned,
  onCraft,
}: {
  card: DeckCard;
  onAdd: () => void;
  onOpenDetails: () => void;
  disabled: boolean;
  disabledReason?: string;
  selectedCount: number;
  unowned: boolean;
  onCraft: () => void;
}) {
  const countView = getDeckCardCountView(card, selectedCount);
  return (
    <article className="ko-decks__collection-card" aria-disabled={disabled && !unowned} data-unowned={unowned || undefined} data-testid={`card-collection-${card.id}`}>
      <Inspectable
        showOnHover
        content={
          <div className="space-y-3">
            <p className="text-[0.62rem] font-black tracking-[0.18em] text-amber-300">
              {cardTypeLabel(card.cardType)} · {card.rarity}
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
              className="mx-auto w-64 max-w-full"
            />
            <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-300">{normalizeCardRulesText(card.text) || "효과 없음"}</p>
          </div>
        }
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={unowned ? `${card.name} 미보유 카드 제작 정보` : `${card.name} 카드 상세 보기`}
          data-testid={`button-card-details-${card.id}`}
          onClick={unowned ? onCraft : onOpenDetails}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (unowned) onCraft();
              else onOpenDetails();
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
        aria-label={unowned ? `${card.name} 제작 정보` : `${card.name} 추가`}
        data-testid={`button-add-card-action-${card.id}`}
        disabled={!unowned && disabled}
        onClick={unowned ? onCraft : onAdd}
      >
        {unowned ? <Hammer className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      </button>
      <p className="ko-decks__card-label" data-testid={`text-card-name-${card.id}`}>{card.name}</p>
      <p className="ko-decks__card-type">
        {cardTypeLabel(card.cardType)} · 비용 {card.cost} · {card.rarity}
      </p>
      {card.quantity !== undefined && (
        <p className="ko-decks__card-type" data-testid={`text-card-ownership-${card.id}`}>
          보유 {countView.ownedCount} · 덱 {countView.deckCount} · 추가 가능 {countView.availableToAdd}
        </p>
      )}
      {disabledReason && <p className="ko-decks__card-limit">{disabledReason}</p>}
    </article>
  );
}

function ChampionPortrait({ champion }: { champion: DeckChampion }) {
  return (
    <div className="ko-decks__champion-art" data-testid={`img-champion-${champion.id}`}>
      {champion.imageUrl ? (
        <CardArtwork
          src={champion.imageUrl}
          alt={`${champion.name} 챔피언 초상`}
          className="aspect-[4/5] w-full"
          imageDisplayMode={champion.imageDisplayMode}
          imageScale={champion.imageScale}
          imagePositionX={champion.imagePositionX}
          imagePositionY={champion.imagePositionY}
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
  const [authError, setAuthError] = useState<string | null>(null);
  const authRequestGeneration = useRef(0);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [options, setOptions] = useState<DeckOptions>({
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
  const [championPickerOpen, setChampionPickerOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<DeckCard | null>(null);
  const [craftTarget, setCraftTarget] = useState<DeckCard | null>(null);
  const [craftCollection, setCraftCollection] = useState<Collection | null>(null);
  const [craftLoading, setCraftLoading] = useState(false);
  const [craftMutating, setCraftMutating] = useState(false);
  const [craftError, setCraftError] = useState("");
  const [craftNotice, setCraftNotice] = useState("");
  const craftRequestGeneration = useRef(0);
  const deleteConfirmationOpenRef = useRef(false);

  const checkAuthentication = useCallback(() => {
    const generation = ++authRequestGeneration.current;
    setAuthStatus("checking");
    setAuthError(null);
    fetchCurrentUser()
      .then((result) => {
        if (generation !== authRequestGeneration.current) return;
        if (result.authenticated && result.user) {
          setAuthUser(result.user);
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
          setIsLoading(false);
        }
      })
      .catch((error) => {
        if (generation !== authRequestGeneration.current) return;
        setAuthError(error instanceof Error ? error.message : "인증 상태를 확인하지 못했습니다.");
        setAuthStatus("error");
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    checkAuthentication();
    return () => {
      authRequestGeneration.current += 1;
    };
  }, [checkAuthentication]);

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
    editingDeck?.cards.forEach((card) => map.set(card.id, card));
    options.cards.forEach((card) => map.set(card.id, card));
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
  const localValidationReasons = useMemo(() => {
    const reasons: DeckValidationReason[] = [];
    if (!selectedChampion) reasons.push(validationReason("DECK", "CHAMPION_REQUIRED", "챔피언을 선택해야 합니다.", undefined, { count: 0, limit: 1 }));
    else if (selectedChampion.status !== "PUBLISHED") reasons.push(validationReason("DECK", "CHAMPION_UNAVAILABLE", "챔피언이 현재 공개 상태가 아닙니다."));
    if (missingIds.length > 0) reasons.push(validationReason("CARD", "CARD_DEFINITION_MISSING", `확인할 수 없는 카드 참조 ${missingIds.length}개가 있습니다.`, missingIds));
    const tokenIds = unique(cardIds.filter((id) => {
      const card = cardById.get(id);
      return Boolean(card?.isToken || card?.isChampionToken);
    }));
    if (tokenIds.length > 0) reasons.push(validationReason("CARD", "TOKEN_CARD_NOT_ALLOWED", "Token 카드는 덱에 직접 편성할 수 없습니다.", tokenIds));
    const unavailableIds = unique(cardIds.filter((id) => {
      const card = cardById.get(id);
      return Boolean(card && card.status !== "PUBLISHED" && !card.isToken && !card.isChampionToken);
    }));
    if (unavailableIds.length > 0) reasons.push(validationReason("CARD", "CARD_NOT_PLAYABLE", "공개된 일반 카드만 대표 덱에 사용할 수 있습니다.", unavailableIds));
    counts.forEach((count, id) => {
      const card = cardById.get(id);
      if (!card) return;
      if (card.rarity !== "LEGENDARY" && count > MAX_CARD_COPIES) {
        reasons.push(validationReason("CARD", "DUPLICATE_CARD", `같은 카드는 최대 ${MAX_CARD_COPIES}장까지 넣을 수 있습니다.`, [id], { count, limit: MAX_CARD_COPIES }));
      } else if (card.rarity === "LEGENDARY" && count > 1) {
        reasons.push(validationReason("CARD", "DUPLICATE_LEGENDARY", "레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.", [id], { count, limit: 1 }));
      }
      const ownershipReason = cardOwnershipReason(card, count, options.isTestAccount === true);
      if (ownershipReason) {
        reasons.push(validationReason("CARD", "CARD_QUANTITY_EXCEEDED", ownershipReason, [id], { count, limit: card.quantity }));
      }
    });
    const canonicalReasons = validateDeckCounts({
      cardCount: cardIds.length,
      legendaryCount,
      legendaryDefinitionCounts: Array.from(counts.entries())
        .filter(([id]) => cardById.get(id)?.rarity === "LEGENDARY")
        .map(([, count]) => count),
      championCount: selectedChampion ? 1 : 0,
    });
    for (const reason of canonicalReasons) {
       if (reason === "INVALID_CARD_COUNT") reasons.push(validationReason("DECK", "CARD_COUNT_INVALID", `카드는 정확히 ${DECK_SIZE}장이어야 합니다.`, undefined, { count: cardIds.length, limit: DECK_SIZE }));
       if (reason === "TOO_MANY_LEGENDARIES") {
         reasons.push(validationReason("CARD", "LEGENDARY_LIMIT_EXCEEDED", `레전더리 카드는 덱에 총 ${MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`, unique(cardIds.filter((id) => cardById.get(id)?.rarity === "LEGENDARY")), { count: legendaryCount, limit: MAX_LEGENDARY_CARDS }));
       }
       if (reason === "INVALID_CHAMPION_COUNT" && !selectedChampion) reasons.push(validationReason("DECK", "CHAMPION_REQUIRED", "챔피언을 선택해야 합니다.", undefined, { count: 0, limit: 1 }));
    }
     return uniqueValidationReasons(reasons);
  }, [cardById, cardIds, counts, legendaryCount, missingIds.length, options.isTestAccount, selectedChampion]);
  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return options.cards.filter((card) => {
      if (card.status !== "PUBLISHED" || card.isToken || card.isChampionToken) return false;
      if (filter !== "ALL" && card.cardType !== filter) return false;
      return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [filter, options.cards, search]);
  const selectedRows = useMemo(() => {
    const rows = Array.from(counts.entries()).map(([id, count]) => ({
      id,
      count,
      card: cardById.get(id) ?? null,
    }));
    return rows.sort((a, b) => {
      if (!a.card || !b.card) return 0;
      if (a.card.cost !== b.card.cost) return a.card.cost - b.card.cost;
      return a.card.name.localeCompare(b.card.name);
    });
  }, [cardById, counts]);
  const savedDraftMatches = Boolean(
    editingDeck &&
    editingDeck.championDefinitionId === championId &&
    sameCardIdList(editingDeck.cardDefinitionIds, cardIds),
  );
  const validationReasons = uniqueValidationReasons([
    ...localValidationReasons,
    ...(savedDraftMatches ? (editingDeck?.validationReasons ?? []) : []),
  ]);
  const problematicCardIds = useMemo(
    () => new Set(validationReasons.flatMap((reason) => reason.cardDefinitionIds ?? [])),
    [validationReasons],
  );
  const isValidForSelection = validationReasons.length === 0;
  const craftInfoCard: CollectionCard | undefined = craftTarget
    ? craftCollection?.craftableCards.find((card) => card.id === craftTarget.id) ??
      craftCollection?.cards.find((card) => card.id === craftTarget.id)
    : undefined;
  const craftSetting = craftTarget
    ? craftCollection?.prismSettings.find((setting) => setting.rarity === craftTarget.rarity)
    : undefined;
  const isCraftable = Boolean(
    craftTarget &&
    craftCollection?.craftableCards.some((card) => card.id === craftTarget.id) &&
    !craftTarget.isToken &&
    !craftTarget.isChampionToken,
  );

  function createDraft() {
    setEditingId(null);
    setDeckName(EMPTY_DECK_NAME);
    setChampionId(null);
    setCardIds([]);
    setStatusMessage("");
    setErrorMessage("");
  }

  function addCard(card: DeckCard) {
    const reason = cardLimitReason(card, counts.get(card.id) ?? 0, legendaryCount, MAX_LEGENDARY_CARDS);
    const ownershipReason = cardOwnershipReason(card, counts.get(card.id) ?? 0, options.isTestAccount === true);
    if (cardIds.length >= DECK_SIZE || card.status !== "PUBLISHED" || card.isToken || card.isChampionToken || reason || ownershipReason) {
      if (cardIds.length >= DECK_SIZE) setErrorMessage(`덱은 정확히 ${DECK_SIZE}장까지 구성할 수 있습니다.`);
      else if (reason) setErrorMessage(reason);
      else if (ownershipReason) setErrorMessage(ownershipReason);
      return;
    }
    setCardIds((current) => [...current, card.id]);
    setStatusMessage(`${card.name} 카드를 한 장 추가했습니다.`);
  }

  async function openCraftFlow(card: DeckCard) {
    const generation = ++craftRequestGeneration.current;
    setCraftTarget(card);
    setCraftCollection(null);
    setCraftError("");
    setCraftNotice("");
    setCraftLoading(true);
    try {
      const collection = await fetchCollection();
      if (generation === craftRequestGeneration.current) setCraftCollection(collection);
    } catch (error: unknown) {
      if (generation === craftRequestGeneration.current) {
        setCraftError(error instanceof Error ? error.message : "제작 정보를 불러오지 못했습니다.");
      }
    } finally {
      if (generation === craftRequestGeneration.current) setCraftLoading(false);
    }
  }

  function closeCraftFlow(open: boolean) {
    if (open || craftMutating) return;
    craftRequestGeneration.current += 1;
    setCraftTarget(null);
    setCraftCollection(null);
    setCraftError("");
    setCraftNotice("");
    setCraftLoading(false);
  }

  async function handleCraftCard() {
    if (!craftTarget || !craftCollection || craftMutating) return;
    const target = craftTarget;
    setCraftMutating(true);
    setCraftError("");
    setCraftNotice("");
    try {
      const result = await requestCardCraft(target.id);
      const [collectionResult, optionsResult] = await Promise.allSettled([
        fetchCollection(),
        fetchDeckOptions(),
      ]);
      if (collectionResult.status === "fulfilled") {
        setCraftCollection(collectionResult.value);
      } else {
        setCraftError(
          `카드는 제작했지만 보유 정보 갱신에 실패했습니다. ${collectionResult.reason instanceof Error ? collectionResult.reason.message : ""}`.trim(),
        );
      }
      if (optionsResult.status === "fulfilled") {
        setOptions(optionsResult.value);
      } else {
        // The craft endpoint is authoritative and returns the resulting quantity;
        // retain that ownership update even if the options refresh is unavailable.
        setOptions((current) => ({
          ...current,
          cards: current.cards.map((card) =>
            card.id === target.id ? { ...card, quantity: result.quantity } : card,
          ),
        }));
        setCraftError((current) =>
          [current, `덱 카드 목록 갱신에 실패했습니다. ${optionsResult.reason instanceof Error ? optionsResult.reason.message : ""}`.trim()]
            .filter(Boolean)
            .join(" "),
        );
      }
      setCraftNotice(`${target.name} 카드를 제작했습니다. 덱에는 자동으로 추가되지 않았습니다.`);
    } catch (error: unknown) {
      setCraftError(error instanceof Error ? error.message : "카드를 제작하지 못했습니다.");
    } finally {
      setCraftMutating(false);
    }
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
    if (deleteConfirmationOpenRef.current || isMutating) return;
    deleteConfirmationOpenRef.current = true;
    const targetName = deckName || "이 덱";
    let confirmed = false;
    try {
      confirmed = window.confirm(`"${targetName}" 덱을 삭제하시겠습니까?`);
    } finally {
      deleteConfirmationOpenRef.current = false;
    }
    if (!confirmed) return;
    setIsMutating(true);
    setErrorMessage("");
    setStatusMessage("");
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
  if (authStatus === "error") {
    return <AuthRecovery message={authError ?? undefined} onRetry={checkAuthentication} />;
  }
  if (authStatus === "unauthenticated") {
    return (
      <AuthPage
        onAuthenticated={(user) => {
          setAuthUser(user);
          setAuthError(null);
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
              onClick={() => {
                setErrorMessage("");
                setAuthStatus("checking");
                fetchCurrentUser()
                  .then((result) => {
                    setAuthUser(result.authenticated ? result.user : null);
                    setAuthStatus(result.authenticated ? "authenticated" : "unauthenticated");
                  })
                  .catch(() => setAuthStatus("unauthenticated"));
              }}
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
                         {deck.champion?.name ?? "챔피언 없음"} · {deck.cardDefinitionIds.length}장
                      </span>
                      <span className={`ko-decks__deck-item-status ${deck.isValid ? "ko-decks__deck-item-status--valid" : ""}`}>
                          {deckValidityLabel(deck.isValid)}
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
                    {item === "ALL" ? "전체" : cardTypeLabel(item)}
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
                {filteredCards.map((card) => {
                  const action = getDeckCardAction(card, {
                    count: counts.get(card.id) ?? 0,
                    deckCount: cardIds.length,
                    deckSize: DECK_SIZE,
                    legendaryCount,
                    maxLegendaryCards: MAX_LEGENDARY_CARDS,
                    isTestAccount: options.isTestAccount === true,
                  });
                  const unowned = action.kind === "CRAFT";
                  return (
                    <DeckCardVisual
                      key={card.id}
                      card={card}
                      selectedCount={counts.get(card.id) ?? 0}
                      disabled={action.kind === "DISABLED"}
                      disabledReason={unowned ? "미보유 · 선택하여 제작" : action.kind === "DISABLED" ? action.reason : undefined}
                      unowned={unowned}
                      onCraft={() => void openCraftFlow(card)}
                      onAdd={() => addCard(card)}
                      onOpenDetails={() => setDetailCard(card)}
                    />
                  );
                })}
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
                <button
                  type="button"
                  className="rounded border border-[#554a3a] px-3 py-1 text-xs font-bold text-[#cdbb94] transition hover:border-[#d9b04b] hover:text-[#f1d47a]"
                  onClick={() => setChampionPickerOpen(true)}
                  data-testid="select-champion"
                >
                  {selectedChampion?.name ?? "챔피언 선택"}
                </button>
              </div>
              <button
                type="button"
                className="ko-decks__champion-slot mt-3 w-full text-left transition hover:border-[#d9b04b] hover:bg-[#201a14]"
                onClick={() => setChampionPickerOpen(true)}
                data-testid="panel-selected-champion"
                aria-label={selectedChampion ? `${selectedChampion.name} 챔피언 변경` : "챔피언 선택"}
              >
                {selectedChampion ? (
                  <>
                    <ChampionPortrait champion={selectedChampion} />
                    <div className="ko-decks__champion-copy min-w-0">
                      <h3>{selectedChampion.name}</h3>
                      <p>{selectedChampion.abilityName} · 비용 {selectedChampion.abilityCost} 골드</p>
                      {selectedChampion.status !== "PUBLISHED" && (
                        <p className="mt-2 flex items-center gap-1 text-[#de8e7f]"><AlertTriangle className="h-3 w-3" /> 공개되지 않은 챔피언</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="col-span-2 py-5 text-center text-xs font-bold text-[#736b62]">챔피언을 선택하세요</p>
                )}
              </button>

              <div className="ko-decks__meter" data-testid="panel-deck-meter">
                <div className="ko-decks__meter-line">
                  <span>FIGHT PLAN / cards</span>
                  <span className="ko-decks__meter-number" data-testid="text-deck-card-count">{cardIds.length} <small className="font-sans text-[0.62rem] text-[#91877b]">/ {DECK_SIZE}</small></span>
                </div>
                <div className="ko-decks__meter-track" aria-hidden="true">
                  <div className="ko-decks__meter-fill" style={{ width: `${Math.min(100, (cardIds.length / DECK_SIZE) * 100)}%` }} />
                </div>
                {cardIds.length !== DECK_SIZE && (
                  <p className="ko-decks__notice ko-decks__notice--quiet mt-3" data-testid="status-deck-incomplete">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                     저장은 가능하지만, 대표 덱으로 선택하려면 카드가 정확히 {DECK_SIZE}장 필요합니다.
                  </p>
                )}
              </div>

              {validationReasons.length > 0 && (
                <div className="ko-decks__notice" role="status" data-testid="status-deck-invalid">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-black">이 덱은 현재 사용할 수 없습니다.</p>
                    {validationReasons.map((reason, index) => (
                      <p key={`${reason.reasonCode}-${index}`} data-testid={`deck-validation-${reason.reasonCode}`}>
                        {reason.scope === "CARD" ? "카드 문제 · " : "덱 문제 · "}
                        {reason.message}
                        {reason.count !== undefined && reason.limit !== undefined && reason.reasonCode !== "CARD_QUANTITY_EXCEEDED"
                          ? ` (${reason.count}/${reason.limit})`
                          : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {missingIds.length > 0 && (
                <div className="mt-2 text-[0.65rem] font-bold leading-5 text-[#d68b7c]" data-testid="warning-missing-cards">
                  저장된 카드 참조를 찾을 수 없습니다: {missingIds.join(", ")}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="ko-decks__section-label">Cards in plan</p>
                  <span className="text-[0.62rem] font-bold text-[#706b65]">일반 동일 카드 2장 · 레전더리 카드별 1장 / 총 {MAX_LEGENDARY_CARDS}장</span>
              </div>
              {selectedRows.length === 0 ? (
                <div className="ko-decks__empty mt-3" data-testid="empty-selected-cards">
                  <p>왼쪽 카드 보관함에서 작전을 채우세요.</p>
                </div>
              ) : (
                <div className="ko-decks__compact-list" data-testid="list-selected-cards">
                  {selectedRows.map(({ id, count, card }) => (
                    <Inspectable
                      key={id}
                      showOnHover
                      content={
                        card ? (
                          <div className="space-y-3">
                            <p className="text-[0.62rem] font-black tracking-[0.18em] text-amber-300">
                              {cardTypeLabel(card.cardType)} · {card.rarity}
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
                              className="mx-auto w-64 max-w-full"
                            />
                            <p className="whitespace-pre-wrap text-xs leading-5 text-neutral-300">{normalizeCardRulesText(card.text) || "효과 없음"}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400">알 수 없는 카드</p>
                        )
                      }
                    >
                      <div
                        className={`ko-decks__compact-row ${problematicCardIds.has(id) ? "ko-decks__compact-row--invalid" : ""}`}
                        data-testid={`row-selected-card-${id}`}
                        data-invalid={problematicCardIds.has(id) ? "true" : undefined}
                        data-rarity={card?.rarity}
                      >
                        <button
                          type="button"
                          className="ko-decks__compact-action"
                          onClick={() => { if (card) setDetailCard(card); }}
                          aria-label={card ? `${card.name} 상세 보기` : "상세 보기"}
                        >
                          <span className="ko-decks__compact-cost">{card?.cost ?? "?"}</span>
                          <span className="ko-decks__compact-name" title={card?.name ?? `확인할 수 없는 카드 (${id})`}>
                            {card?.name ?? `확인할 수 없는 카드 (${id})`}
                            {problematicCardIds.has(id) && <AlertTriangle className="ml-1.5 inline-block h-3 w-3 shrink-0 text-[#e18a79]" aria-label="덱 검증 문제" />}
                          </span>
                          <span className="ko-decks__compact-qty" data-testid={`text-card-count-${id}`}>×{count}</span>
                        </button>
                        <button
                          type="button"
                          className="ko-decks__compact-remove"
                          aria-label={`${card?.name ?? id} 한 장 제거`}
                          data-testid={`button-remove-card-${id}`}
                          onClick={(e) => { e.stopPropagation(); removeCard(id); }}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </Inspectable>
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
      <CardDetailDialog
        card={detailCard}
        open={Boolean(detailCard)}
        onOpenChange={(open) => { if (!open) setDetailCard(null); }}
      />
      <Dialog
        open={Boolean(craftTarget)}
        onOpenChange={closeCraftFlow}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto border-neutral-800 bg-neutral-950 text-white sm:max-w-2xl">
          {craftTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-black">{craftInfoCard?.name ?? craftTarget.name}</DialogTitle>
                <DialogDescription className="text-left text-sm text-neutral-400">
                  {craftTarget.rarity} · {cardTypeLabel(craftTarget.cardType)} · 미보유 카드는 제작 전 덱에 추가되지 않습니다.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[minmax(160px,240px)_1fr] sm:items-start">
                <div className="min-w-0">
                  <CardRenderer
                    name={craftInfoCard?.name ?? craftTarget.name}
                    cardType={craftTarget.cardType}
                    cost={craftInfoCard?.cost ?? craftTarget.cost}
                    attack={craftInfoCard?.attack ?? craftTarget.attack}
                    health={craftInfoCard?.health ?? craftTarget.health}
                    rulesText={craftInfoCard?.text ?? craftTarget.text}
                    imageUrl={craftInfoCard?.imageUrl ?? craftTarget.imageUrl}
                    rarity={craftTarget.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
                    imageDisplaySettings={craftInfoCard ? {
                      imageDisplayMode: craftInfoCard.imageDisplayMode,
                      imageScale: craftInfoCard.imageScale,
                      imagePositionX: craftInfoCard.imagePositionX,
                      imagePositionY: craftInfoCard.imagePositionY,
                    } : cardSettings(craftTarget)}
                    size="board"
                    className="mx-auto w-full max-w-[240px]"
                  />
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4">
                    <h3 className="font-black text-amber-200">{craftInfoCard?.name ?? craftTarget.name}</h3>
                    <p className="mt-1 text-xs font-bold text-neutral-400">{craftTarget.rarity} · 카드 비용 {craftTarget.cost}</p>
                    <p className="mt-3 text-sm leading-6 text-neutral-300">
                      {normalizeCardRulesText(craftInfoCard?.text ?? craftTarget.text) || "효과 없음"}
                    </p>
                  </div>
                  {craftLoading ? (
                    <p className="rounded border border-neutral-800 bg-black/30 p-3 text-sm text-neutral-400" role="status">
                      프리즘 제작 정보를 불러오는 중...
                    </p>
                  ) : craftCollection && (
                    <section className="rounded-lg border border-neutral-800 bg-black/30 p-4" aria-label="프리즘 제작 정보">
                      <p className="text-xs font-black text-amber-200">일반 프리즘</p>
                      <p className="mt-2 text-sm text-neutral-300" data-testid="text-craft-prism-balance">
                        현재 보유량: <strong className="text-amber-200">{craftCollection.isTestAccount ? "∞" : craftCollection.prismBalance.toLocaleString()}</strong>
                      </p>
                      {craftSetting?.configured && craftSetting.craftCost !== null ? (
                        <>
                          <p className="mt-1 text-sm text-neutral-300" data-testid="text-craft-prism-cost">
                            제작 비용: <strong className="text-amber-200">{craftSetting.craftCost.toLocaleString()} 프리즘</strong>
                          </p>
                          {craftInfoCard && craftInfoCard.quantity > 0 && (
                            <p className="mt-2 rounded border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-300">
                              이미 보유한 카드입니다. 제작 전 덱에 자동으로 추가되지 않습니다.
                            </p>
                          )}
                          {!craftInfoCard?.quantity && !isCraftable && (
                            <p className="mt-2 text-xs text-amber-200">제작할 수 없는 카드입니다.</p>
                          )}
                          {!craftInfoCard?.quantity && isCraftable && !craftCollection.isTestAccount && craftCollection.prismBalance < craftSetting.craftCost && (
                            <p className="mt-2 text-xs text-red-300">프리즘이 부족합니다.</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-amber-200">관리자 프리즘 설정이 없어 이 카드를 제작할 수 없습니다.</p>
                      )}
                    </section>
                  )}
                  {craftError && <p role="alert" className="rounded border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200" data-testid="status-craft-error">{craftError}</p>}
                  {craftNotice && <p role="status" className="rounded border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-200" data-testid="status-craft-success">{craftNotice}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-300 transition hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      data-testid="button-cancel-card-craft"
                      disabled={craftMutating}
                      onClick={() => closeCraftFlow(false)}
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded bg-amber-400 px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                      data-testid="button-confirm-card-craft"
                      disabled={
                        craftLoading ||
                        craftMutating ||
                        !craftInfoCard ||
                        !isCraftable ||
                        !craftSetting?.configured ||
                        craftSetting.craftCost === null ||
                        (Boolean(craftInfoCard.quantity > 0)) ||
                        (!craftCollection?.isTestAccount && Boolean(craftCollection && craftSetting && craftCollection.prismBalance < (craftSetting.craftCost ?? 0)))
                      }
                      onClick={() => void handleCraftCard()}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Hammer className="h-4 w-4" aria-hidden="true" />
                        {craftMutating ? "제작 중..." : craftInfoCard?.quantity ? "이미 보유 중" : "카드 제작"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={championPickerOpen} onOpenChange={setChampionPickerOpen}>
        <DialogContent className="max-w-3xl border-neutral-800 bg-[#110f0d] text-white max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left text-xl font-black">챔피언 선택</DialogTitle>
            <DialogDescription className="text-left text-sm text-neutral-400">
              현재 계정에서 사용할 수 있는 공개 챔피언만 표시됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from(championById.values())
              .filter((champion) => champion.status === "PUBLISHED")
              .map((champion) => (
                <button
                  key={champion.id}
                  type="button"
                  className={`grid grid-cols-[72px_1fr] gap-3 rounded-lg border p-3 text-left transition ${
                    champion.id === championId
                      ? "border-amber-400 bg-amber-950/30"
                      : "border-neutral-800 bg-neutral-950/70 hover:border-amber-700"
                  }`}
                  onClick={() => {
                    setChampionId(champion.id);
                    setChampionPickerOpen(false);
                  }}
                  data-testid={`button-select-champion-${champion.id}`}
                >
                  <ChampionPortrait champion={champion} />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-amber-200">{champion.name}</strong>
                    <span className="mt-1 block text-xs font-bold text-neutral-300">
                      {champion.abilityName} · 비용 {champion.abilityCost} 골드
                    </span>
                    <span className="mt-2 block line-clamp-3 text-xs leading-5 text-neutral-400">
                      {champion.abilityText || champion.description || "능력 설명 없음"}
                    </span>
                    {champion.hasQuest && (
                      <span className="mt-2 inline-block rounded border border-emerald-800 px-1.5 py-0.5 text-[10px] font-black text-emerald-300">
                        QUEST
                      </span>
                    )}
                  </span>
                </button>
              ))}
          </div>
          {selectedChampion && (
            <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
              <h3 className="font-black text-amber-200">{selectedChampion.name} 상세</h3>
              <p className="mt-2 text-sm font-bold text-neutral-200">
                기본 능력 · 비용 {selectedChampion.abilityCost} 골드 · {selectedChampion.abilityName}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                {selectedChampion.abilityText || selectedChampion.description || "능력 설명 없음"}
              </p>
              {selectedChampion.hasQuest && (
                <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3 text-sm">
                  <p className="font-black text-emerald-300">퀘스트 · {selectedChampion.questName}</p>
                  <p className="whitespace-pre-wrap text-neutral-300">{selectedChampion.questText}</p>
                  {selectedChampion.questRewardText && <p className="whitespace-pre-wrap text-amber-200">보상 · {selectedChampion.questRewardText}</p>}
                  {selectedChampion.upgradedAbilityText && <p className="whitespace-pre-wrap text-sky-200">강화 능력 · {selectedChampion.upgradedAbilityText}</p>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </main>
    </AltInspectProvider>
  );
}
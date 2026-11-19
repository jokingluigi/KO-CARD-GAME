import {championPreparationCopy} from '@/lib/champion-preparation-copy';

import {isTokenCard} from "@/game/cards/types";
import '@/components/catalog-browsing.css';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {useContinuousCatalog,CatalogContinuation,useCatalogDensity,CatalogDensity} from '@/components/continuous-catalog';
import {prefersReducedMotion} from "@/components/presentation-config";
import "@/components/player-ux/player-ux.css";
import {useBrowsingState,validCatalogView} from "@/components/player-ux/browsing-state";
import {useDeckRecovery} from "@/components/player-ux/use-deck-recovery";
import {sameDraft} from "@/components/player-ux/policy";
import {flyBetween,useGridReflow} from "@/components/physical-feedback";
import { CardCatalogFilters, EMPTY_CATALOG_FILTERS, matchesCatalogFilters } from "@/components/card-catalog-filters";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronUp, Hammer, Info, Plus, RefreshCw, Search, Share2, Shield, SlidersHorizontal, Star, Swords, Trash2, X } from "lucide-react";
import "@/components/deck-builder.css";
import "@/components/lux-quiet.css";
import { Link } from "wouter";
import { AuthPage, AuthLoading, AuthRecovery } from "@/components/auth-page";
import { AltInspectProvider, Inspectable } from "@/components/alt-inspector";
import { CardRenderer } from "@/components/card-renderer";
import { CardArtwork } from "@/components/card-artwork";
import { CollectionActionAnimation, type CollectionActionScene } from "@/components/collection-action-animation";
import { CardDetailDialog } from "@/components/card-detail-dialog";
import { DeckShareDialog } from "@/components/deck-share-dialog";
import { createDeckSnapshot } from "@/lib/deck-share-validation";
import type { SharedDeck } from "@/lib/deck-share-code";
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
import { CardRulesText } from "@/components/card-rules-text";
import { DECK_SIZE, MAX_LEGENDARY_CARDS, maxCardCopies, cardCopyLimitMessage, validateDeckCounts } from "@workspace/game-engine";
import { cardLimitReason, cardOwnershipReason, getDeckCardAction, getDeckCardCountView } from "./deck-card-availability";
import { cardOwnershipValidationReason, formatDeckValidationReason, mergeDeckValidationReasons, uniqueValidationReasons } from "./deck-validation";

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
  const [editorCollapsed, setEditorCollapsed] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px) and (orientation: portrait)').matches);
  const [deckName, setDeckName] = useState(EMPTY_DECK_NAME);
  const [championId, setChampionId] = useState<string | null>(null);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [search, setSearch] = useBrowsingState("decks:search","",v=>typeof v==='string'&&v.length<300);
  const [filter, setFilter] = useBrowsingState<CardFilter>("decks:cardType","ALL",v=>typeof v==='string'&&["ALL","WRESTLER","TECHNIQUE"].includes(v));
  const [favoritesOnly, setFavoritesOnly] = useBrowsingState("decks:favoritesOnly",false,v=>typeof v==='boolean');
  const [catalogFilters, setCatalogFilters] = useBrowsingState("decks:filters",EMPTY_CATALOG_FILTERS,validCatalogView);
  const [favorites] = useState<string[]>(() => {
    try { const value = JSON.parse(window.localStorage.getItem('ko-card-favorites') ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
    catch { return []; }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const mutationLock = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{id:string; name:string} | null>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const errorRegion = useRef<HTMLDivElement | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [championPickerOpen, setChampionPickerOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<DeckCard | null>(null);
  const [shareMode, setShareMode] = useState<'share' | 'import' | null>(null);
  const [shareSnapshot, setShareSnapshot] = useState<SharedDeck | null>(null);
  const [importCode, setImportCode] = useState('');
  useEffect(() => {
    const openLink = () => {
      const code = new URLSearchParams(window.location.hash.slice(1)).get('deck');
      if (code) { setImportCode(code); setShareMode('import'); }
    };
    openLink();
    window.addEventListener('hashchange', openLink);
    return () => window.removeEventListener('hashchange', openLink);
  }, []);
  function closeShare() {
    setShareMode(null); setImportCode('');
    if (new URLSearchParams(window.location.hash.slice(1)).has('deck')) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  const [craftTarget, setCraftTarget] = useState<DeckCard | null>(null);
  const [craftCollection, setCraftCollection] = useState<Collection | null>(null);
  const [craftLoading, setCraftLoading] = useState(false);
  const [craftMutating, setCraftMutating] = useState(false);
  const [craftError, setCraftError] = useState("");
  const [craftNotice, setCraftNotice] = useState("");
  const [craftScene, setCraftScene] = useState<CollectionActionScene | null>(null);
  const craftRequestGeneration = useRef(0);
  useEffect(() => {
    if (!errorMessage) return;
    const frame = requestAnimationFrame(() => {
      errorRegion.current?.focus({preventScroll:true});
      errorRegion.current?.scrollIntoView({block:"nearest",behavior:"instant"});
    });
    return () => cancelAnimationFrame(frame);
  }, [errorMessage]);
  function beginMutation() {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setIsMutating(true);
    return true;
  }
  function endMutation() {
    mutationLock.current = false;
    setIsMutating(false);
  }

  const checkAuthentication = useCallback(() => {
    const generation = ++authRequestGeneration.current;
    setAuthStatus(previous => previous === "error" ? "error" : "checking");
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
    setLoadFailed(false);
    Promise.all([fetchDeckOptions(), fetchDecks()])
      .then(([nextOptions, nextDecks]) => {
        if (cancelled) return;
        setOptions(nextOptions);
        setDecks(nextDecks);
        const requested=new URLSearchParams(window.location.search).get('edit');
        const initial = nextDecks.find(deck=>deck.id===requested) ?? nextDecks.find((deck) => deck.isSelected) ?? nextDecks[0];
        if (requested && initial?.id === requested) setWorkspace('editor');
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
          setLoadFailed(true);
          setErrorMessage(error instanceof Error ? error.message : "덱 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, loadAttempt]);

  const editingDeck = decks.find((deck) => deck.id === editingId) ?? null;
  const currentDraft={editingId,name:deckName,championId,cards:cardIds};
  const baseline={editingId:editingDeck?.id??null,name:editingDeck?.name??EMPTY_DECK_NAME,championId:editingDeck?.championDefinitionId??null,cards:editingDeck?.cardDefinitionIds??[]};
  const dirty=!sameDraft(currentDraft,baseline);
  const recovery=useDeckRecovery(authUser?.id,authStatus==='authenticated'&&!isLoading,currentDraft,dirty);
  const changeEditor=(action:()=>void)=>{if(mutationLock.current)return;if(!dirty||window.confirm('저장하지 않은 변경이 있어요. 다른 덱으로 이동할까요?'))action();};
  const cardById = useMemo(() => {
    const map = new Map<string, DeckCard>();
    editingDeck?.cards.forEach((card) => map.set(card.id, card));
    options.cards.forEach((card) => map.set(card.id, card));
    return map;
  }, [editingDeck, options.cards]);
  const cardNames = useMemo(
    () => new Map(Array.from(cardById, ([id, card]) => [id, card.name])),
    [cardById],
  );
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
  const deckCurve = useMemo(() => {
    const cards = cardIds.map((id) => cardById.get(id)).filter((card): card is DeckCard => Boolean(card));
    return {
      early: cards.filter((card) => card.cost <= 2).length,
      late: cards.filter((card) => card.cost >= 5).length,
      techniques: cards.filter((card) => card.cardType === 'TECHNIQUE').length,
    };
  }, [cardIds, cardById]);
  const missingIds = useMemo(
    () => unique([...(editingDeck?.missingCardDefinitionIds ?? []), ...cardIds.filter((id) => !cardById.has(id))]),
    [cardById, cardIds, editingDeck?.missingCardDefinitionIds],
  );
  const localValidationReasons = useMemo(() => {
    const reasons: DeckValidationReason[] = [];
    if (!selectedChampion) reasons.push(validationReason("DECK", "CHAMPION_REQUIRED", "챔피언을 선택해야 합니다.", undefined, { count: 0, limit: 1 }));
    else if ((selectedChampion.status !== "PUBLISHED" && !(selectedChampion.status === "DRAFT"))) reasons.push(validationReason("DECK", "CHAMPION_UNAVAILABLE", "챔피언이 현재 공개 상태가 아닙니다."));
    if (missingIds.length > 0) reasons.push(validationReason("CARD", "CARD_DEFINITION_MISSING", `확인할 수 없는 카드 참조 ${missingIds.length}개가 있습니다.`, missingIds));
    const tokenIds = unique(cardIds.filter((id) => {
      const card = cardById.get(id);
      return Boolean(card && isTokenCard(card));
    }));
    if (tokenIds.length > 0) reasons.push(validationReason("CARD", "TOKEN_CARD_NOT_ALLOWED", "Token 카드는 덱에 직접 편성할 수 없습니다.", tokenIds));
    const unavailableIds = unique(cardIds.filter((id) => {
      const card = cardById.get(id);
      return Boolean(card && (card.status !== "PUBLISHED" && !(card.status === "DRAFT" && (authUser?.role === "ADMIN" || (card.quantity ?? 0) > 0))) && !isTokenCard(card));
    }));
    if (unavailableIds.length > 0) reasons.push(validationReason("CARD", "CARD_NOT_PLAYABLE", "공개된 일반 카드만 출전 덱에 사용할 수 있습니다.", unavailableIds));
    counts.forEach((count, id) => {
      const card = cardById.get(id);
      if (!card) return;
      if (card.rarity !== "LEGENDARY" && count > maxCardCopies(card.rarity)) {
        reasons.push(validationReason("CARD", "DUPLICATE_CARD", cardCopyLimitMessage(card.rarity), [id], { count, limit: maxCardCopies(card.rarity) }));
      } else if (card.rarity === "LEGENDARY" && count > 1) {
        reasons.push(validationReason("CARD", "DUPLICATE_LEGENDARY", "레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.", [id], { count, limit: 1 }));
      }
      const ownershipViolation = cardOwnershipValidationReason(card, count, options.isTestAccount === true);
      if (ownershipViolation) reasons.push(ownershipViolation);
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
  }, [authUser?.role, cardById, cardIds, counts, legendaryCount, missingIds.length, options.isTestAccount, selectedChampion]);
  const [density,setDensity]=useCatalogDensity();
  const [workspace, setWorkspace] = useState<'decks'|'editor'>('decks');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [costBucket, setCostBucket] = useState<number | null>(null);
  const [notice, setNoticeText] = useState("");
  const [noticeKey, setNoticeKey] = useState(0);
  const setNotice = (text: string) => { setNoticeText(text); setNoticeKey(key => key + 1); };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNoticeText(""), 1600); return () => clearTimeout(timer); }, [notice, noticeKey]);
  const activeFilterCount = Object.values(catalogFilters).filter(value => value !== "ALL").length;
  useEffect(()=>{window.dispatchEvent(new Event('ko-close-inspector'));},[workspace]);
  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return options.cards.filter((card) => {
      if ((card.status !== "PUBLISHED" && !(card.status === "DRAFT" && (authUser?.role === "ADMIN" || (card.quantity ?? 0) > 0))) || isTokenCard(card)) return false;
      if (!matchesCatalogFilters(card, catalogFilters)) return false;
      if (filter !== "ALL" && card.cardType !== filter) return false;
      if (favoritesOnly && !favorites.includes(card.id)) return false;
      if (costBucket !== null && (costBucket === 7 ? card.cost < 7 : card.cost !== costBucket)) return false;
      return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [filter, options.cards, search, favorites, favoritesOnly, catalogFilters, authUser?.role, costBucket]);
  const curve = useMemo(() => {
    const bins = [0,0,0,0,0,0,0,0];
    cardIds.forEach(id => { const card = cardById.get(id); if (card) bins[Math.min(7, Math.max(0, card.cost))] += 1; });
    return bins;
  }, [cardIds, cardById]);
  const curveMax = Math.max(0, ...curve);

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
   const validationReasons = mergeDeckValidationReasons(
     localValidationReasons,
     savedDraftMatches ? (editingDeck?.validationReasons ?? []) : [],
   );
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
    !isTokenCard(craftTarget),
  );

  function createDraft() {
    setEditingId(null);
    setDeckName(EMPTY_DECK_NAME);
    setChampionId(null);
    setCardIds([]);
    setStatusMessage("");
    setErrorMessage("");
  }

  const catalogRoot=useRef<HTMLElement>(null);
  const libraryRoot=useRef<HTMLElement>(null);
  const catalog=useContinuousCatalog('decks',JSON.stringify([search,filter,catalogFilters,favoritesOnly,costBucket]),filteredCards.length,!isLoading,libraryRoot,workspace);

  useGridReflow(catalogRoot,filteredCards.map(c=>c.id).join());

  const [changedCard,setChangedCard]=useState<{id:string;kind:"add"|"remove"}|null>(null);
  useEffect(()=>{if(!changedCard)return;const timer=setTimeout(()=>setChangedCard(null),650);return()=>clearTimeout(timer);},[changedCard]);

  function addCard(card: DeckCard) {
    if (mutationLock.current) return;
    const reason = cardLimitReason(card, counts.get(card.id) ?? 0, legendaryCount, MAX_LEGENDARY_CARDS);
    const ownershipReason = cardOwnershipReason(card, counts.get(card.id) ?? 0, options.isTestAccount === true);
    if (cardIds.length >= DECK_SIZE || (card.status !== "PUBLISHED" && !(card.status === "DRAFT" && (authUser?.role === "ADMIN" || (card.quantity ?? 0) > 0))) || isTokenCard(card) || reason || ownershipReason) {
      if (cardIds.length >= DECK_SIZE) setNotice(`덱이 가득 찼어요 (${DECK_SIZE}장).`);
      else if (reason) setNotice(reason);
      else if (ownershipReason) setNotice(ownershipReason);
      return;
    }
    const deckTarget = Array.from(document.querySelectorAll('[data-deck-target]')).find(node => (node as HTMLElement).offsetParent !== null && node.getBoundingClientRect().height > 0);
    flyBetween(document.querySelector(`[data-testid="card-collection-${CSS.escape(card.id)}"] .kdb-card__hit`),deckTarget);
    setChangedCard({id:card.id,kind:"add"});
    setCardIds((current) => [...current, card.id]);
    setStatusMessage("");
    setNotice(`+ ${card.name}  (${cardIds.length + 1}/${DECK_SIZE})`);
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
      setCraftScene({ id: Date.now(), kind: "CRAFT", name: target.name, imageUrl: target.imageUrl });
    } catch (error: unknown) {
      setCraftError(error instanceof Error ? error.message : "카드를 제작하지 못했습니다.");
    } finally {
      setCraftMutating(false);
    }
  }

  function removeCard(id: string) {
    if (mutationLock.current) return;
    if(!cardIds.includes(id))return;
    setChangedCard({id,kind:"remove"});
    flyBetween(document.querySelector(`[data-testid="row-selected-card-${CSS.escape(id)}"]`),document.querySelector(`[data-testid="card-collection-${CSS.escape(id)}"]`),true);
    setCardIds((current) => {
      const index = current.indexOf(id);
      if (index < 0) return current;
      return [...current.slice(0, index), ...current.slice(index + 1)];
    });
    setStatusMessage("");
  }

  async function handleSave() {
    if (mutationLock.current) return;
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      setErrorMessage("덱 이름을 입력해주세요.");
      return;
    }
    if (!beginMutation()) return;
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
      recovery.discard();
      openDeck(result.deck);
      setStatusMessage("전략을 저장했습니다.");

    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "덱을 저장하지 못했습니다.");
    } finally {
      endMutation();
    }
  }

  async function handleSelect() {
    if (!editingId || !isValidForSelection) return;
    if(dirty){setErrorMessage("변경 사항을 먼저 저장한 뒤 출전 덱으로 지정해 주세요.");return;}
    if (!beginMutation()) return;
    setErrorMessage("");
    setStatusMessage("");
    try {
      const result = await selectDeck(editingId);
      if (!result.deck) throw new Error("서버가 선택된 덱을 반환하지 않았습니다.");
      const selected = result.deck;
      setDecks(current => replaceDeck(current.map(deck => ({...deck, isSelected:false})), {...selected,isSelected:true}));
      openDeck({...selected,isSelected:true});
      setStatusMessage("출전 덱을 변경했습니다.");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "출전 덱을 변경하지 못했습니다.");
    } finally {
      endMutation();
    }
  }

  function handleDelete() {
    if (!editingId || mutationLock.current) return;
    deleteTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleteTarget({id:editingId,name:deckName || "이 덱"});
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || !beginMutation()) return;
    setDeleteTarget(null);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await deleteDeck(target.id);
      setDecks(current => current.filter(deck => deck.id !== target.id));
      recovery.discard();
      createDraft();
      setWorkspace('decks');
      setStatusMessage("덱을 삭제했습니다. 보유 카드는 그대로 유지돼요.");
      requestAnimationFrame(() => document.getElementById("deck-name")?.focus());
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "덱을 삭제하지 못했습니다.");
    } finally {
      endMutation();
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
      <main ref={catalogRoot} className="kdb" data-view={workspace} data-sheet={sheetOpen?'open':'closed'}>
      {workspace==='decks' ? (
        <div className="kdb-home">
          <header className="kdb-home__head">
            <Link href="/" className="kdb-back" data-testid="link-main-menu"><ArrowLeft className="h-4 w-4" aria-hidden="true" />메인</Link>
            <h1 className="kdb-title" data-testid="text-page-title">내 덱</h1>
            <button type="button" className="kdb-ghost" data-testid="button-import-deck" onClick={() => { setImportCode(''); setShareMode('import'); }}>덱 코드 가져오기</button>
          </header>
          {errorMessage && <div ref={errorRegion} tabIndex={-1} className="kdb-alert" role="alert" data-testid="status-decks-error"><span>{errorMessage}</span>{loadFailed && <button type="button" className="kdb-ghost" data-testid="button-retry-decks" onClick={() => {setErrorMessage("");setLoadAttempt(value=>value+1);}}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />다시 불러오기</button>}</div>}
          {statusMessage && <p className="kdb-toast-line" role="status" data-testid="status-decks-success">{statusMessage}</p>}
          {recovery.recovery&&<section className="kdb-recover" role="status"><p>저장하지 않은 덱 편집이 남아 있어요: <b>{recovery.recovery.name}</b></p><div><button type="button" className="kdb-gold" onClick={()=>{const d=recovery.recovery!;setEditingId(decks.some(x=>x.id===d.editingId)?d.editingId:null);setDeckName(d.name);setChampionId(d.championId);setCardIds([...d.cards]);recovery.acknowledge();setWorkspace('editor');}}>이어서 편집</button><button type="button" className="kdb-ghost" onClick={recovery.discard}>버리기</button></div></section>}
          <div className="kdb-decks" data-testid="list-decks">
            {decks.map((deck) => {
              const champ = deck.champion ?? (deck.championDefinitionId ? championById.get(deck.championDefinitionId) : undefined);
              return (
                <button key={deck.id} type="button" className="kdb-deckcase" data-selected={deck.isSelected||undefined} data-valid={deck.isValid||undefined} data-testid={`button-open-deck-${deck.id}`} onClick={() => {openDeck(deck);setWorkspace("editor");setSheetOpen(false);}}>
                  <span className="kdb-deckcase__art">{champ?.imageUrl ? <CardArtwork src={champ.imageUrl} alt="" className="h-full w-full" imageDisplayMode={champ.imageDisplayMode} imageScale={champ.imageScale} imagePositionX={champ.imagePositionX} imagePositionY={champ.imagePositionY} /> : <Shield className="h-10 w-10" aria-hidden="true" />}</span>
                  {deck.isSelected && <span className="kdb-deckcase__badge"><Check className="h-3.5 w-3.5" aria-hidden="true" />출전 덱</span>}
                  <span className="kdb-deckcase__plate">
                    <span className="kdb-deckcase__name">{deck.name}</span>
                    <span className="kdb-deckcase__meta">{champ?.name ?? "챔피언 없음"} · <b data-full={deck.cardDefinitionIds.length===DECK_SIZE||undefined}>{deck.cardDefinitionIds.length}/{DECK_SIZE}</b></span>
                    {!deck.isValid && <span className="kdb-deckcase__warn"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{deckValidityLabel(deck.isValid)}</span>}
                  </span>
                </button>
              );
            })}
            <button type="button" className="kdb-deckcase kdb-deckcase--new" data-testid="button-create-deck" onClick={()=>{createDraft();setWorkspace("editor");setSheetOpen(false);setChampionPickerOpen(true);}}>
              <span className="kdb-deckcase__plus"><Plus className="h-9 w-9" aria-hidden="true" /></span>
              <span className="kdb-deckcase__plate"><span className="kdb-deckcase__name">새 덱 만들기</span><span className="kdb-deckcase__meta">챔피언부터 골라요</span></span>
            </button>
          </div>
        </div>
      ) : (
        <fieldset disabled={isMutating} className="kdb-editor" aria-label="덱 구성" aria-busy={isMutating}>
          <section ref={libraryRoot} id="deck-library" className="kdb-library" aria-label="카드 컬렉션">
            <div className="kdb-bar-top">
              <button type="button" className="kdb-back" onClick={()=>{if(!dirty||window.confirm('저장하지 않은 변경이 있어요. 덱 목록으로 나갈까요?')){if(editingDeck)openDeck(editingDeck);setWorkspace('decks');}}}><ArrowLeft className="h-4 w-4" aria-hidden="true" />내 덱</button>
              <label className="kdb-search">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="카드 이름으로 검색" placeholder="카드 검색" data-testid="input-card-search" />
                {search && <button type="button" aria-label="검색어 지우기" onClick={()=>setSearch("")}><X className="h-3.5 w-3.5" /></button>}
              </label>
              <div className="kdb-types" role="group" aria-label="카드 유형 필터">
                {(["ALL", "WRESTLER", "TECHNIQUE"] as CardFilter[]).map((item) => (
                  <button key={item} type="button" aria-pressed={filter === item} data-testid={`button-filter-${item.toLowerCase()}`} onClick={() => setFilter(item)}>{item === "ALL" ? "전체" : cardTypeLabel(item)}</button>
                ))}
                <button type="button" aria-pressed={favoritesOnly} aria-label="즐겨찾기만" onClick={() => setFavoritesOnly((value) => !value)}><Star className="h-3.5 w-3.5" /></button>
              </div>
              <details className="kdb-morefilter">
                <summary><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />필터{activeFilterCount>0?` ${activeFilterCount}`:''}</summary>
                <div className="kdb-morefilter__panel"><CardCatalogFilters cards={options.cards} value={catalogFilters} onChange={setCatalogFilters} /></div>
              </details>
            </div>
            <div className="kdb-costs" role="group" aria-label="비용으로 보기">
              {[0,1,2,3,4,5,6,7].map(cost=>(
                <button key={cost} type="button" className="kdb-gem" aria-pressed={costBucket===cost} aria-label={`비용 ${cost}${cost===7?' 이상':''}`} onClick={()=>setCostBucket(current=>current===cost?null:cost)}>{cost===7?'7+':cost}</button>
              ))}
              <span className="kdb-costs__count" data-testid="text-card-result-count">{filteredCards.length}종</span>
            </div>
            {filteredCards.length === 0 ? (
              <div className="kdb-empty" data-testid="empty-card-results">
                <Search className="mx-auto h-7 w-7" aria-hidden="true" />
                <p>조건에 맞는 카드가 없어요.</p>
                <button type="button" className="kdb-ghost" onClick={()=>{setSearch("");setFilter("ALL");setFavoritesOnly(false);setCostBucket(null);setCatalogFilters({...EMPTY_CATALOG_FILTERS});}}>검색·필터 초기화</button>
              </div>
            ) : (
              <div className="kdb-grid" data-testid="grid-card-collection">
                {filteredCards.slice(0,catalog.limit).map((card) => {
                  const count = counts.get(card.id) ?? 0;
                  const action = getDeckCardAction(card, { count, deckCount: cardIds.length, deckSize: DECK_SIZE, legendaryCount, maxLegendaryCards: MAX_LEGENDARY_CARDS, isTestAccount: options.isTestAccount === true, isAdmin: authUser?.role === "ADMIN" });
                  const unowned = action.kind === "CRAFT";
                  const limit = card.rarity === "LEGENDARY" ? 1 : maxCardCopies(card.rarity);
                  return (
                    <article key={card.id} data-motion-key={card.id} className="kdb-card" data-unowned={unowned || undefined} data-maxed={(!unowned && action.kind === "DISABLED") || undefined} data-in-deck={count>0||undefined} data-bump={changedCard?.id===card.id?changedCard.kind:undefined} data-testid={`card-collection-${card.id}`}>
                      <button type="button" className="kdb-card__hit" data-testid={`button-add-card-action-${card.id}`}
                        aria-label={unowned ? `${card.name} 제작 정보` : `${card.name} 덱에 넣기`}
                        onClick={()=>{ if(unowned){void openCraftFlow(card);return;} if(action.kind==="DISABLED"){setNotice(action.reason ?? "더 넣을 수 없어요.");return;} addCard(card); }}
                        onContextMenu={(event)=>{event.preventDefault();setDetailCard(card);}}>
                        <CardRenderer cardId={card.id} keywords={card.keywords} keywordConfig={card.effectConfig} name={card.name} cardType={card.cardType} cost={card.cost} attack={card.attack} health={card.health} rulesText={card.text} imageUrl={card.imageUrl} rarity={card.rarity as "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION"} imageDisplaySettings={cardSettings(card)} size="detail" className="w-full" />
                      </button>
                      <button type="button" className="kdb-card__info" aria-label={`${card.name} 자세히 보기`} data-testid={`button-card-details-${card.id}`} onClick={()=>setDetailCard(card)}><Info className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      {unowned ? <span className="kdb-card__tag kdb-card__tag--craft"><Hammer className="h-3 w-3" aria-hidden="true" />제작</span>
                        : <span className="kdb-card__tag" data-testid={`text-card-ownership-${card.id}`}>{count>0?<b>{count}</b>:null}{count>0?' / ':''}{limit}장{card.quantity!==undefined&&!options.isTestAccount?` · 보유 ${card.quantity}`:''}</span>}
                    </article>
                  );
                })}
              </div>
            )}
            <CatalogContinuation catalog={catalog} total={filteredCards.length}/>
          </section>

          <aside id="deck-workspace" className="kdb-deck" aria-label="현재 덱">
            <button type="button" className="kdb-peek" data-deck-target onClick={()=>setSheetOpen(open=>!open)} aria-expanded={sheetOpen}>
              <span className="kdb-peek__champ">{selectedChampion?.imageUrl ? <CardArtwork src={selectedChampion.imageUrl} alt="" className="h-full w-full" imageDisplayMode={selectedChampion.imageDisplayMode} imageScale={selectedChampion.imageScale} imagePositionX={selectedChampion.imagePositionX} imagePositionY={selectedChampion.imagePositionY} /> : <Shield className="h-5 w-5" aria-hidden="true" />}</span>
              <span className="kdb-peek__text"><b>{deckName || EMPTY_DECK_NAME}</b><small>{dirty ? '저장 안 됨' : editingDeck?.isSelected ? '출전 덱' : '덱 보기'}</small></span>
              <span key={cardIds.length} className="kdb-peek__count" data-full={cardIds.length===DECK_SIZE||undefined}>{cardIds.length}<small>/{DECK_SIZE}</small></span>
              <ChevronUp className="kdb-peek__chev h-5 w-5" aria-hidden="true" />
            </button>
            <div className="kdb-deck__body">
              <div className="kdb-hero">
                <button type="button" className="kdb-hero__art" onClick={() => setChampionPickerOpen(true)} data-testid="panel-selected-champion" aria-label={selectedChampion ? `${selectedChampion.name} 챔피언 변경` : "챔피언 선택"}>
                  {selectedChampion?.imageUrl ? <CardArtwork src={selectedChampion.imageUrl} alt="" className="h-full w-full" imageDisplayMode={selectedChampion.imageDisplayMode} imageScale={selectedChampion.imageScale} imagePositionX={selectedChampion.imagePositionX} imagePositionY={selectedChampion.imagePositionY} /> : <span className="kdb-hero__pick"><Plus className="h-6 w-6" aria-hidden="true" />챔피언 선택</span>}
                </button>
                <div className="kdb-hero__info">
                  <label className="sr-only" htmlFor="deck-name">덱 이름</label>
                  <input id="deck-name" className="kdb-hero__name" value={deckName} maxLength={40} onChange={(event) => setDeckName(event.target.value)} data-testid="input-deck-name" />
                  <button type="button" className="kdb-hero__champ" onClick={() => setChampionPickerOpen(true)} data-testid="select-champion">{selectedChampion ? <>{selectedChampion.name} · 능력 {selectedChampion.abilityCost}골드 <span>바꾸기</span></> : '챔피언을 골라 주세요'}</button>
                </div>
                <button type="button" className="kdb-sheet-close" aria-label="덱 닫기" onClick={()=>setSheetOpen(false)}><ChevronDown className="h-5 w-5" /></button>
              </div>

              <div className="kdb-count" data-testid="panel-deck-meter">
                <span className="kdb-count__num" data-testid="text-deck-card-count" data-full={cardIds.length===DECK_SIZE||undefined}>{cardIds.length}<small> / {DECK_SIZE}</small></span>
                <div className="kdb-curve" aria-label="비용 분포">
                  {curve.map((value,cost)=>(<span key={cost} className="kdb-curve__col"><i style={{height:`${curveMax?Math.round(value/curveMax*100):0}%`}} /><em>{cost===7?'7+':cost}</em></span>))}
                </div>
              </div>

              {selectedRows.length === 0 ? (
                <div className="kdb-deck__empty" data-testid="empty-selected-cards" data-deck-target>카드를 눌러서 덱에 넣으세요.<br/><small>덱에 넣은 카드를 누르면 한 장씩 빠져요.</small></div>
              ) : (
                <ul className="kdb-list" data-testid="list-selected-cards" data-deck-target>
                  {selectedRows.map(({ id, count, card }) => (
                    <li key={id} className="kdb-row" data-testid={`row-selected-card-${id}`} data-invalid={problematicCardIds.has(id) ? "true" : undefined} data-rarity={card?.rarity} data-edit-cue={changedCard?.id===id?changedCard.kind:undefined}>
                      <Inspectable className="flex min-w-0 flex-1" touchInspectTriggerOnly showOnHover content={card ? <CardRenderer cardId={card.id} keywords={card.keywords} keywordConfig={card.effectConfig} name={card.name} cardType={card.cardType} cost={card.cost} attack={card.attack} health={card.health} rulesText={card.text} imageUrl={card.imageUrl} rarity={card.rarity as "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION"} imageDisplaySettings={cardSettings(card)} size="detail" className="mx-auto w-60 max-w-full" /> : <p className="text-xs text-neutral-400">알 수 없는 카드</p>}>
                        <button type="button" className="kdb-row__btn" data-testid={`button-remove-card-${id}`} aria-label={`${card?.name ?? id} 한 장 빼기`} onClick={() => removeCard(id)} onContextMenu={(event)=>{event.preventDefault();if(card)setDetailCard(card);}}>
                          <span className="kdb-row__cost">{card?.cost ?? "?"}</span>
                          <span className="kdb-row__name">{card?.name ?? `확인할 수 없는 카드`}{problematicCardIds.has(id) && <AlertTriangle className="ml-1 inline-block h-3 w-3" aria-label="문제 있음" />}</span>
                          {card?.imageUrl && <span className="kdb-row__art" style={{backgroundImage:`url("${card.imageUrl}")`}} aria-hidden="true" />}
                          <span key={count} className="kdb-row__qty" data-testid={`text-card-count-${id}`}>{card?.rarity==='LEGENDARY'?'★':count>1?`×${count}`:''}</span>
                        </button>
                      </Inspectable>
                    </li>
                  ))}
                </ul>
              )}

              {(validationReasons.length > 0 || missingIds.length > 0) && (
                <details className="kdb-issues" role="status" data-testid="status-deck-invalid">
                  <summary><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{cardIds.length!==DECK_SIZE&&validationReasons.length===1?`카드 ${DECK_SIZE - cardIds.length > 0 ? `${DECK_SIZE - cardIds.length}장 더 필요해요` : `${cardIds.length - DECK_SIZE}장 빼야 해요`}`:`출전하려면 고칠 것 ${validationReasons.length}개`}</summary>
                  {validationReasons.map((reason, index) => (
                    <p key={`${reason.reasonCode}-${index}`} data-testid={`deck-validation-${reason.reasonCode}`}>{formatDeckValidationReason(reason, cardNames)}{(reason.reasonCode==='CHAMPION_REQUIRED'||reason.cardDefinitionIds?.length)&&<button type="button" onClick={()=>{const id=reason.cardDefinitionIds?.[0];if(reason.reasonCode==='CHAMPION_REQUIRED'){setChampionPickerOpen(true);return;}const node=id?document.querySelector<HTMLElement>(`[data-testid="row-selected-card-${CSS.escape(id)}"]`):null;node?.scrollIntoView({block:'center',behavior:'smooth'});}}>보기</button>}</p>
                  ))}
                  {missingIds.length > 0 && <p data-testid="warning-missing-cards">찾을 수 없는 카드: {missingIds.join(", ")}</p>}
                </details>
              )}

              <div className="kdb-actions">
                <button type="button" className="kdb-gold kdb-actions__save" data-testid="button-save-deck" aria-busy={isMutating} disabled={isMutating} onClick={handleSave}><Check className="h-4 w-4" aria-hidden="true" />{isMutating ? "저장 중..." : dirty || !editingId ? "저장" : "저장됨"}</button>
                <button type="button" className="kdb-ghost" data-testid="button-select-deck" title={dirty?"먼저 저장하세요.":"빠른 대전·AI 대전에 쓸 덱"} disabled={isMutating || !editingId || !isValidForSelection || dirty || editingDeck?.isSelected} onClick={handleSelect}><Swords className="h-4 w-4" aria-hidden="true" />{editingDeck?.isSelected?"출전 중":"출전 덱으로"}</button>
                <button type="button" className="kdb-icon" aria-label="덱 코드 공유" data-testid="button-share-deck" disabled={isMutating} onClick={() => {
                  try { setShareSnapshot(createDeckSnapshot(deckName, selectedChampion ?? undefined, cardIds, cardById)); setShareMode('share'); setErrorMessage(''); }
                  catch (error) { setErrorMessage(error instanceof Error ? error.message : '덱을 공유하지 못했습니다.'); }
                }}><Share2 className="h-4 w-4" aria-hidden="true" /></button>
                {editingId && <button type="button" className="kdb-icon kdb-icon--danger" aria-label="덱 삭제" data-testid="button-delete-deck" disabled={isMutating} onClick={handleDelete}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
              {(errorMessage||statusMessage) && <p ref={errorRegion} tabIndex={-1} className={errorMessage?'kdb-msg kdb-msg--err':'kdb-msg'} role={errorMessage?'alert':'status'} data-testid={errorMessage?'status-decks-error':'status-decks-success'}>{errorMessage||statusMessage}</p>}
              {dirty&&recovery.error&&<p className="kdb-msg kdb-msg--err">임시 보관 실패 — 나가기 전에 저장하세요.</p>}
            </div>
          </aside>
          {notice && <div className="kdb-notice" role="status" key={notice+noticeKey}>{notice}</div>}
        </fieldset>
      )}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open=>{if(!open)setDeleteTarget(null);}}>
        <AlertDialogContent className="ko-deck-delete-dialog" onCloseAutoFocus={event=>{
          event.preventDefault();
          if(deleteTrigger.current?.isConnected)deleteTrigger.current.focus({preventScroll:true});
          else document.getElementById("deck-name")?.focus({preventScroll:true});
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>이 덱을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> 덱 구성이 삭제돼요. 보유 카드와 스킨은 그대로 유지되지만, 삭제한 덱 구성은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 보관</AlertDialogCancel>
            <AlertDialogAction onClick={()=>void confirmDelete()} className="bg-red-950 text-red-100 hover:bg-red-900">덱 삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CardDetailDialog
        card={detailCard}
        open={Boolean(detailCard)}
        onOpenChange={(open) => { if (!open) setDetailCard(null); }}
      />
      <DeckShareDialog mode={isLoading ? null : shareMode} snapshot={shareSnapshot} initialCode={importCode} options={options} onClose={closeShare} onImported={deck => {
        setDecks(current => replaceDeck(current, deck)); openDeck(deck); setEditorCollapsed(false); closeShare(); setStatusMessage('공유 덱을 새 전략으로 추가했습니다.');
      }} />
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
                    cardId={craftInfoCard?.id ?? craftTarget.id}
                    keywords={craftInfoCard?.keywords ?? craftTarget.keywords}
                    keywordConfig={craftInfoCard?.effectConfig ?? craftTarget.effectConfig}
                    name={craftInfoCard?.name ?? craftTarget.name}
                    cardType={craftTarget.cardType}
                    cost={craftInfoCard?.cost ?? craftTarget.cost}
                    attack={craftInfoCard?.attack ?? craftTarget.attack}
                    health={craftInfoCard?.health ?? craftTarget.health}
                    rulesText={craftInfoCard?.text ?? craftTarget.text}
                    imageUrl={craftInfoCard?.imageUrl ?? craftTarget.imageUrl}
                    rarity={craftTarget.rarity as "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION"}
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
                      <CardRulesText text={normalizeCardRulesText(craftInfoCard?.text ?? craftTarget.text) || "효과 없음"} />
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
                              보유 {craftInfoCard.quantity}장 / 제작 한도 {maxCardCopies(craftInfoCard.rarity)}장
                            </p>
                          )}
                          {!isCraftable && (
                            <p className="mt-2 text-xs text-amber-200">제작할 수 없는 카드입니다.</p>
                          )}
                          {isCraftable && !craftCollection.isTestAccount && craftCollection.prismBalance < craftSetting.craftCost && (
                            <p className="mt-2 text-xs text-red-300">프리즘이 부족합니다.</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-amber-200">현재 제작할 수 없는 카드예요. 잠시 후 다시 확인해 주세요.</p>
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
                        craftInfoCard.quantity >= maxCardCopies(craftInfoCard.rarity) ||
                        (!craftCollection?.isTestAccount && Boolean(craftCollection && craftSetting && craftCollection.prismBalance < (craftSetting.craftCost ?? 0)))
                      }
                      onClick={() => void handleCraftCard()}
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        <Hammer className="h-4 w-4" aria-hidden="true" />
                        {craftMutating ? "제작 중..." : craftInfoCard && craftInfoCard.quantity >= maxCardCopies(craftInfoCard.rarity) ? "제작 한도 도달" : "카드 제작"}
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
        <DialogContent className="kdb-champ-dialog max-w-4xl border-neutral-800 bg-[#110f0d] text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left text-2xl font-black text-[#ffe6a8]">챔피언 선택</DialogTitle>
            <DialogDescription className="text-left text-sm text-neutral-400">
              덱의 주인공을 골라 주세요. 나중에 바꿀 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="kdb-champs">
            {Array.from(championById.values())
              .filter((champion) => champion.status === "PUBLISHED" || champion.status === "DRAFT")
              .map((champion) => (
                <button key={champion.id} type="button" className="kdb-champ" data-active={champion.id === championId || undefined}
                  onClick={() => { setChampionId(champion.id); setChampionPickerOpen(false); }}
                  data-testid={`button-select-champion-${champion.id}`}>
                  <span className="kdb-champ__art">{champion.imageUrl ? <CardArtwork src={champion.imageUrl} alt="" className="h-full w-full" imageDisplayMode={champion.imageDisplayMode} imageScale={champion.imageScale} imagePositionX={champion.imagePositionX} imagePositionY={champion.imagePositionY} /> : <Shield className="h-10 w-10" aria-hidden="true" />}</span>
                  <span className="kdb-champ__plate">
                    <strong>{champion.name}</strong>
                    <small>능력 {champion.abilityCost}골드{champion.hasQuest ? ' · 피니셔' : ''}</small>
                  </span>
                  <span className="kdb-champ__text">{champion.abilityText || champion.description || "능력 설명 없음"}</span>
                </button>
              ))}
          </div>
          {selectedChampion && (
            <div className="rounded-lg border border-neutral-800 bg-black/30 p-4">
              <h3 className="font-black text-amber-200">{selectedChampion.name} 상세</h3>
              <p className="mt-2 text-sm font-bold text-neutral-200">
                고유 능력 · 비용 {selectedChampion.abilityCost} 골드
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                {selectedChampion.abilityText || selectedChampion.description || "능력 설명 없음"}
              </p>
              {selectedChampion.hasQuest && (
                <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3 text-sm">
                  <p className="font-black text-emerald-300">피니셔 준비</p>
                  <p className="whitespace-pre-wrap text-neutral-300">{championPreparationCopy(selectedChampion).condition}</p>
                  {championPreparationCopy(selectedChampion).reward && <p className="whitespace-pre-wrap text-amber-200">피니셔 획득 / 현재 완료 효과 · {championPreparationCopy(selectedChampion).reward}</p>}
                  {!championPreparationCopy(selectedChampion).linked && selectedChampion.upgradedAbilityText && <p className="whitespace-pre-wrap text-sky-200">강화 능력 · {selectedChampion.upgradedAbilityText}</p>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {craftScene && <CollectionActionAnimation scene={craftScene} onComplete={() => setCraftScene(null)} />}
      </main>
    </AltInspectProvider>
  );
}

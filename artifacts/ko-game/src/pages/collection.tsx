import {championPreparationCopy} from '@/lib/champion-preparation-copy';
import {isTokenCard} from "@/game/cards/types";
import '@/components/catalog-browsing.css';
import { RelatedCards } from "@/components/player-tools/related-cards";
import { CardRulesText } from "@/components/card-rules-text";
import {GamePageHeader} from '@/components/game-page-header';
import {useContinuousCatalog,CatalogContinuation,useCatalogDensity,CatalogDensity} from '@/components/continuous-catalog';
import {returnToCatalogCard} from "@/components/physical-feedback";
import {useBrowsingState,validCatalogView} from "@/components/player-ux/browsing-state";
import {WishlistArrivals} from "@/components/player-tools/wishlist";
import {MotionNumber} from "@/components/presentation-motion";
import {useGridReflow} from "@/components/physical-feedback";
import { CardCatalogFilters, EMPTY_CATALOG_FILTERS, matchesCatalogFilters } from "@/components/card-catalog-filters";
import { useEffect, useMemo, useState, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, BookOpen, ChevronDown, Hammer, Search, Shield, SlidersHorizontal, Sparkles, Swords, Star, X } from "lucide-react";
import "@/components/deck-builder.css";
import "@/components/lux-quiet.css";
import { CardRenderer } from "@/components/card-renderer";
import { CardArtwork } from "@/components/card-artwork";
import { CollectionActionAnimation, type CollectionActionScene } from "@/components/collection-action-animation";
import { CardDetailDialog } from "@/components/card-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { disenchantExtras, craftCard, craftChampion, disenchantCard, fetchCollection, type ChampionPrismSetting, type Collection, type CollectionCard, type CollectionChampion, type PrismSetting } from "@/lib/collection-client";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { cardTypeLabel } from "@/lib/display-labels";
import { maxCardCopies } from "@workspace/game-engine/rules";

type CollectionTab = "cards" | "crafting" | "champions";
type CardTypeFilter = "ALL" | "WRESTLER" | "TECHNIQUE";
type CardSort = "COST" | "NAME" | "RARITY";
type CollectionLoadState = "loading" | "ready" | "error";

function rarityLabel(rarity: string) {
  return rarity === "CHAMPION" ? "CHAMPION" : rarity === "EPIC" ? "EPIC" : rarity === "LEGENDARY" ? "LEGENDARY" : "NORMAL";
}

function CardCollectionItem({ card, onOpen, showCraftable = false, unlimited = false, favorite = false, onFavorite }: { card: CollectionCard; onOpen: () => void; showCraftable?: boolean; unlimited?: boolean; favorite?: boolean; onFavorite: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      data-motion-key={card.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="ko-collection-item group min-w-0 cursor-pointer rounded-xl border border-neutral-800 bg-black/35 p-2 text-left transition hover:-translate-y-1 hover:border-amber-500/70 hover:bg-amber-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      aria-label={`${card.name} 카드 상세 보기`}
    >
      <div className="relative">
        <CardRenderer
          cardId={card.id}
          isToken={card.isToken}
          isChampionToken={card.isChampionToken}
          isSilenceImmune={card.isSilenceImmune}
          keywords={card.keywords}
          keywordConfig={card.effectConfig}
          name={card.name}
          cardType={card.cardType as "WRESTLER" | "TECHNIQUE"}
          cost={card.cost}
          attack={card.attack}
          health={card.health}
          rulesText={card.text}
          imageUrl={card.imageUrl}
          artworkLoading="lazy"
          rarity={card.rarity as "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION"}
          imageDisplaySettings={{
            imageDisplayMode: card.imageDisplayMode,
            imageScale: card.imageScale,
            imagePositionX: card.imagePositionX,
            imagePositionY: card.imagePositionY,
          }}
          size="board"
          className="w-full"
        />
        <span className="absolute right-1 top-1 z-30 rounded-full border border-amber-300/50 bg-black/80 px-2 py-1 text-xs font-black text-amber-200">
            {unlimited ? "∞" : showCraftable && card.quantity === 0 ? "제작 가능" : <MotionNumber value={card.quantity} format={n=>`×${n}`}/>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2">
        <span className="truncate text-sm font-black text-white">{card.name}</span>
         <span className="shrink-0 text-[10px] font-bold text-neutral-500">{cardTypeLabel(card.cardType)}</span>
         <button type="button" aria-label={`${card.name} ${favorite ? '즐겨찾기 해제' : '즐겨찾기'}`} aria-pressed={favorite}
           onClick={(event) => { event.stopPropagation(); onFavorite(); }}
           onKeyDown={(event) => event.stopPropagation()}
           className="min-h-11 min-w-11 shrink-0 rounded p-1 focus-visible:outline-2 focus-visible:outline-amber-300">
           <Star className={`h-4 w-4 ${favorite ? 'fill-amber-400 text-amber-400' : 'text-neutral-500'}`} />
         </button>
      </div>
    </article>
  );
}

function ChampionCollectionItem({ champion, onOpen }: { champion: CollectionChampion; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-xl border border-neutral-800 bg-black/35 text-left transition hover:-translate-y-1 hover:border-amber-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-950/80 to-neutral-950">
        {champion.imageUrl ? (
          <CardArtwork
            src={champion.imageUrl}
            loading="lazy"
            alt=""
            className="h-full w-full transition duration-300 group-hover:scale-105"
            imageDisplayMode={champion.imageDisplayMode}
            imageScale={champion.imageScale}
            imagePositionX={champion.imagePositionX}
            imagePositionY={champion.imagePositionY}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-rose-300"><Shield className="h-12 w-12" /></div>
        )}
        <span className={`absolute bottom-2 left-2 rounded px-2 py-1 text-[10px] font-black ${champion.owned ? "bg-emerald-950/90 text-emerald-300" : "bg-neutral-950/90 text-neutral-300"}`}>{champion.owned ? "해금됨" : "미보유"}</span>
      </div>
      <div className="p-4">
        <h3 className="font-black text-white">{champion.name}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">{champion.owned ? (champion.abilityText || champion.description) : "미보유 챔피언 · 상세 정보를 확인하고 제작할 수 있습니다."}</p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-amber-300">고유 능력</p>
      </div>
    </button>
  );
}

export default function CollectionPage() {
  const [, navigate] = useLocation();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [tab, setTab] = useBrowsingState<CollectionTab>("collection:tab","cards",v=>typeof v==='string'&&["cards","crafting","champions"].includes(v));
  const [search, setSearch] = useBrowsingState("collection:search","",v=>typeof v==='string'&&v.length<300);
  const [cardType, setCardType] = useBrowsingState<CardTypeFilter>("collection:cardType","ALL",v=>typeof v==='string'&&["ALL","WRESTLER","TECHNIQUE"].includes(v));
  const [catalogFilters, setCatalogFilters] = useBrowsingState("collection:filters",EMPTY_CATALOG_FILTERS,validCatalogView);
  const catalogCards = useMemo(() => [...new Map([...(collection?.craftableCards ?? []), ...(collection?.cards ?? [])].filter(card=>!isTokenCard(card)).map(card => [card.id, card])).values()], [collection]);
  const [sort, setSort] = useBrowsingState<CardSort>("collection:sort","COST",v=>typeof v==='string'&&["COST","NAME","RARITY"].includes(v));
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value = JSON.parse(window.localStorage.getItem('ko-card-favorites') ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
    catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useBrowsingState("collection:favoritesOnly",false,v=>typeof v==='boolean');
  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { window.localStorage.setItem('ko-card-favorites', JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
  }
  const [selectedCard, setSelectedCard] = useState<CollectionCard | null>(null);
  const [disassemblyQuantity, setDisassemblyQuantity] = useState(1);
  const [selectedChampion, setSelectedChampion] = useState<CollectionChampion | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { type: "CRAFT"; card: CollectionCard; quantity: number }
    | { type: "DISENCHANT"; card: CollectionCard; quantity: number; keepPlayableCopies?: boolean }
    | { type: "CHAMPION_CRAFT"; champion: CollectionChampion }
    | null
  >(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionScene, setActionScene] = useState<CollectionActionScene | null>(null);
  const [loadState, setLoadState] = useState<CollectionLoadState>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("컬렉션을 불러오는 중...");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    setCollection(null);
    fetchCollection()
      .then((nextCollection) => {
        if (!cancelled) {
          setCollection(nextCollection);
          setLoadState("ready");
          setMessage("");
        }
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message.includes("로그인이 필요합니다")) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        setLoadState("error");
        setLoadError(error.message || "컬렉션을 불러오지 못했습니다. 다시 시도해주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, navigate]);

  const [density,setDensity]=useCatalogDensity();
  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return [...catalogCards]
      .filter((card) => {
        if (cardType !== "ALL" && card.cardType !== cardType) return false;
        if (!matchesCatalogFilters(card, catalogFilters)) return false;
        if (favoritesOnly && !favorites.includes(card.id)) return false;
        return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (sort === "NAME") return left.name.localeCompare(right.name, "ko");
        if (sort === "RARITY") return (["NORMAL", "EPIC", "LEGENDARY", "CHAMPION", "TOKEN"].indexOf(left.rarity) - ["NORMAL", "EPIC", "LEGENDARY", "CHAMPION", "TOKEN"].indexOf(right.rarity)) || left.name.localeCompare(right.name, "ko");
        return left.cost - right.cost || left.name.localeCompare(right.name, "ko");
      });
  }, [cardType, catalogCards, catalogFilters, search, sort, favorites, favoritesOnly]);

  const filteredCraftableCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return [...(collection?.craftableCards ?? [])]
      .filter((card) => {
        if (cardType !== "ALL" && card.cardType !== cardType) return false;
        if (!matchesCatalogFilters(card, catalogFilters)) return false;
        if (favoritesOnly && !favorites.includes(card.id)) return false;
        return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (sort === "NAME") return left.name.localeCompare(right.name, "ko");
        if (sort === "RARITY") return (["NORMAL", "EPIC", "LEGENDARY", "CHAMPION", "TOKEN"].indexOf(left.rarity) - ["NORMAL", "EPIC", "LEGENDARY", "CHAMPION", "TOKEN"].indexOf(right.rarity)) || left.name.localeCompare(right.name, "ko");
        return left.cost - right.cost || left.name.localeCompare(right.name, "ko");
      });
  }, [cardType, collection?.craftableCards, catalogFilters, search, sort, favorites, favoritesOnly]);

  const champions = collection?.champions ?? [];
  const selectedSetting = selectedCard
    ? collection?.prismSettings.find((setting) => setting.rarity === selectedCard.rarity)
    : undefined;
  const prismBalance = collection?.prismBalance ?? 0;
  const championPrismBalance = collection?.championPrismBalance ?? 0;
  const safeDisassemblyQuantity = selectedCard
    ? Math.min(Math.max(disassemblyQuantity, 1), Math.max(selectedCard.quantity, 1))
    : 1;

  const selectedExcess = selectedCard ? Math.max(0, selectedCard.quantity - maxCardCopies(selectedCard.rarity)) : 0;
  const excessCount = (collection?.craftableCards ?? []).reduce((sum, card) => sum + Math.max(0, card.quantity - maxCardCopies(card.rarity)), 0);
  async function executeBulkDisenchant() {
    if (isMutating) return;
    setIsMutating(true);
    let applied = false;
    try {
      const result = await disenchantExtras();
      applied = true;
      setBulkConfirm(false);
      setCollection(await fetchCollection());
      setSelectedCard(null);
      setMessage(`${result.dismantledQuantity}장 일괄 분해 · ${result.reward.toLocaleString()} 프리즘 획득`);
    } catch (error) {
      setMessage(applied ? '분해는 완료됐지만 목록을 다시 불러오지 못했습니다. 컬렉션을 다시 열어 확인해 주세요.' : error instanceof Error ? error.message : '일괄 분해에 실패했습니다.');
    } finally { setIsMutating(false); }
  }

  async function executePendingAction() {
    if (!pendingAction || isMutating) return;
    const action = pendingAction;
    let earnedPrism = 0;
    let applied = false;
    setIsMutating(true);
    setMessage("");
    try {
      if (action.type === "CRAFT") {
        await craftCard(action.card.id);
      } else if (action.type === "DISENCHANT") {
         earnedPrism = (await disenchantCard(action.card.id, action.quantity, action.keepPlayableCopies)).reward;
      } else {
        await craftChampion(action.champion.id);
      }
      applied = true;
      const nextCollection = await fetchCollection();
      setCollection(nextCollection);
      if (action.type !== "CHAMPION_CRAFT") {
        setSelectedCard(nextCollection.craftableCards.find((card) => card.id === action.card.id) ?? null);
      } else {
        setSelectedChampion(nextCollection.champions.find((champion) => champion.id === action.champion.id) ?? null);
      }
      setPendingAction(null);
       setMessage(action.type === "CRAFT" ? "카드를 제작했습니다." : action.type === "DISENCHANT"
         ? `${action.card.name} ${action.quantity}장 분해 · ${earnedPrism.toLocaleString()} 프리즘 획득`
         : "챔피언을 제작했습니다.");
    } catch (error) {
      setMessage(applied
        ? `작업은 완료됐지만 컬렉션을 새로고침하지 못했습니다: ${error instanceof Error ? error.message : "다시 열어 확인해 주세요."}`
        : error instanceof Error ? error.message : "프리즘 요청을 처리하지 못했습니다.");
    } finally {
      if (applied) {
        setPendingAction(null);
        setActionScene({
          id: Date.now(),
          kind: action.type,
          name: action.type === "CHAMPION_CRAFT" ? action.champion.name : action.card.name,
          imageUrl: action.type === "CHAMPION_CRAFT" ? action.champion.imageUrl : action.card.imageUrl,
          quantity: action.type === "DISENCHANT" ? action.quantity : undefined,
        });
      }
      setIsMutating(false);
    }
  }

  const gridRoot=useRef<HTMLElement>(null);
  const listedCards=tab==='crafting'?filteredCraftableCards:filteredCards;
  const catalog=useContinuousCatalog('collection',JSON.stringify([tab,search,sort,cardType,catalogFilters,favoritesOnly]),listedCards.length,loadState==='ready',gridRoot);
  useGridReflow(gridRoot,`${tab}:${filteredCards.map(c=>c.id).join()}:${filteredCraftableCards.map(c=>c.id).join()}`);

  if (loadState === "loading") {
    return <CollectionLoading />;
  }

  if (loadState === "error" || !collection) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8 sm:py-8">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <section className="w-full rounded-xl border border-red-900/60 bg-black/40 p-8 text-center">
            <p className="font-display text-xs font-bold tracking-[0.25em] text-red-300">COLLECTION ERROR</p>
            <h1 className="mt-3 text-xl font-black">컬렉션을 불러오지 못했습니다.</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {loadError || "잠시 후 다시 시도해주세요."}
            </p>
            <button
              type="button"
              className="mt-6 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black transition hover:bg-yellow-300"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              다시 시도
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main ref={gridRoot} className="kdb lux ko-collection" data-view="collection">
      <div className="lux-wrap">
        <WishlistArrivals kind="card" owned={[...(collection?.cards??[]).filter(c=>c.quantity>0).map(c=>c.id),...(collection?.champions??[]).filter(c=>c.owned).map(c=>c.id)]}/>
        <header className="lux-head">
          <button type="button" className="lux-back" onClick={()=>navigate(ROUTES.MAIN_MENU)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />메인</button>
          <h1 className="lux-title">컬렉션</h1>
          <span data-ui-balance className="lux-chip" title="일반 프리즘"><Sparkles className="h-4 w-4" aria-hidden="true" />{collection.isTestAccount ? "∞" : <MotionNumber value={collection.prismBalance} format={n=>n.toLocaleString()}/>}</span>
          <span className="lux-chip lux-chip--rose" title="챔피언 프리즘"><Shield className="h-4 w-4" aria-hidden="true" />{collection.isTestAccount ? "∞" : <MotionNumber value={championPrismBalance} format={n=>n.toLocaleString()}/>}</span>
          <button type="button" className="lux-gold" onClick={()=>navigate(ROUTES.DECKS)}><BookOpen className="h-4 w-4" aria-hidden="true" />덱 편집</button>
        </header>

        <Dialog open={bulkConfirm} onOpenChange={open => { if (!isMutating) setBulkConfirm(open); }}>
          <DialogContent className="kdb-champ-dialog text-white">
            <DialogHeader><DialogTitle>남는 카드 한 번에 분해</DialogTitle><DialogDescription>일반 3장, 에픽 2장, 레전더리 1장만 남기고 나머지 {excessCount}장을 프리즘으로 바꿔요.</DialogDescription></DialogHeader>
            <div className="flex gap-2"><button type="button" className="lux-ghost flex-1" disabled={isMutating} onClick={() => setBulkConfirm(false)}>취소</button>
            <button type="button" className="lux-gold flex-1" disabled={isMutating} onClick={() => void executeBulkDisenchant()}>{isMutating ? '처리 중...' : `${excessCount}장 분해`}</button></div>
          </DialogContent>
        </Dialog>
        {message && <p role="status" className="lux-msg">{message}</p>}

        <nav className="lux-tabs" aria-label="컬렉션 보기">
          <button type="button" aria-pressed={tab==="cards"} onClick={() => setTab("cards")}>카드<small>{collection.cards.length}</small></button>
          <button type="button" aria-pressed={tab==="crafting"} onClick={() => setTab("crafting")}>제작하기<small>{collection.craftableCards.length}</small></button>
          <button type="button" aria-pressed={tab==="champions"} onClick={() => setTab("champions")}>챔피언<small>{champions.length}</small></button>
        </nav>

        {tab === "cards" || tab === "crafting" ? (
          <>
            <div className="kdb-bar-top kcol-bar">
              <label className="kdb-search">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="카드 검색" aria-label="카드 이름 검색" />
                {search && <button type="button" aria-label="검색어 지우기" onClick={() => setSearch("")}><X className="h-3.5 w-3.5" /></button>}
              </label>
              <div className="kdb-types" role="group" aria-label="카드 종류">
                {(["ALL","WRESTLER","TECHNIQUE"] as CardTypeFilter[]).map(item=><button key={item} type="button" aria-pressed={cardType===item} onClick={()=>setCardType(item)}>{item==="ALL"?"전체":cardTypeLabel(item)}</button>)}
                <button type="button" aria-pressed={favoritesOnly} aria-label="즐겨찾기만" onClick={() => setFavoritesOnly((value) => !value)}><Star className="h-3.5 w-3.5" /></button>
              </div>
              <label className="kcol-sort"><span className="sr-only">정렬</span>
                <select aria-label="정렬" value={sort} onChange={(event)=>setSort(event.target.value as CardSort)}><option value="COST">비용순</option><option value="NAME">이름순</option><option value="RARITY">등급순</option></select>
              </label>
              <details className="kdb-morefilter">
                <summary><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />필터{Object.values(catalogFilters).filter(v=>v&&v!=="ALL").length?` ${Object.values(catalogFilters).filter(v=>v&&v!=="ALL").length}`:''}</summary>
                <div className="kdb-morefilter__panel"><CardCatalogFilters cards={catalogCards} value={catalogFilters} onChange={setCatalogFilters} /></div>
              </details>
            </div>
            <div className="kdb-costs" role="group" aria-label="비용으로 보기">
              {[0,1,2,3,4,5,6,7].map(cost=>{const key=String(cost);const on=catalogFilters.cost===key;return(
                <button key={cost} type="button" className="kdb-gem" aria-pressed={on} aria-label={`비용 ${cost}`} onClick={()=>setCatalogFilters({...catalogFilters,cost:on?"ALL":key})}>{cost}</button>)})}
              <span className="kdb-costs__count">{listedCards.length}종</span>
              {excessCount > 0 && <button type="button" className="lux-ghost kcol-bulk" disabled={isMutating} onClick={() => setBulkConfirm(true)}><Hammer className="h-4 w-4" aria-hidden="true" />남는 카드 분해 {excessCount}</button>}
            </div>

            {listedCards.length === 0 ? (
              <div className="kdb-empty" role="status">
                <Search className="mx-auto h-7 w-7" aria-hidden="true" />
                <p>{tab === "cards" ? (catalogCards.length ? "조건에 맞는 카드가 없어요." : "아직 카드가 없어요.") : "조건에 맞는 제작 카드가 없어요."}</p>
                <button type="button" className="kdb-ghost" onClick={()=>{setSearch("");setCardType("ALL");setFavoritesOnly(false);setCatalogFilters({...EMPTY_CATALOG_FILTERS});}}>검색·필터 초기화</button>
              </div>
            ) : (
              <div className="kdb-grid kcol-grid" data-testid="collection-card-grid">
                {listedCards.slice(0,catalog.limit).map((card) => {
                  const fav=favorites.includes(card.id);
                  const owned=collection.isTestAccount||card.quantity>0;
                  return (
                    <article key={card.id} data-motion-key={card.id} className="kdb-card" data-unowned={!owned||undefined}>
                      <button type="button" className="kdb-card__hit" aria-label={`${card.name} 자세히 보기`} onClick={()=>setSelectedCard(card)}>
                        <CardRenderer cardId={card.id} isToken={card.isToken} isChampionToken={card.isChampionToken} isSilenceImmune={card.isSilenceImmune} keywords={card.keywords} keywordConfig={card.effectConfig} name={card.name} cardType={card.cardType as "WRESTLER" | "TECHNIQUE"} cost={card.cost} attack={card.attack} health={card.health} rulesText={card.text} imageUrl={card.imageUrl} artworkLoading="lazy" rarity={card.rarity as "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION"} imageDisplaySettings={{imageDisplayMode: card.imageDisplayMode, imageScale: card.imageScale, imagePositionX: card.imagePositionX, imagePositionY: card.imagePositionY}} size="detail" className="w-full" />
                      </button>
                      <button type="button" className="kdb-card__info kcol-fav" aria-pressed={fav} aria-label={`${card.name} ${fav ? '즐겨찾기 해제' : '즐겨찾기'}`} onClick={()=>toggleFavorite(card.id)}><Star className="h-3.5 w-3.5" /></button>
                      <span className={owned?"kdb-card__tag":"kdb-card__tag kdb-card__tag--craft"}>{collection.isTestAccount ? "∞ 보유" : owned ? <>보유 <b><MotionNumber value={card.quantity} format={n=>`${n}`}/></b>장</> : <><Hammer className="h-3 w-3" aria-hidden="true" />없음 · 눌러서 제작</>}</span>
                    </article>
                  );
                })}
              </div>
            )}
            <CatalogContinuation catalog={catalog} total={listedCards.length}/>
          </>
        ) : champions.length === 0 ? (
          <div className="kdb-empty" role="status"><p>현재 공개된 챔피언이 없어요.</p></div>
        ) : (
          <div className="kdb-champs kcol-champs">
            {champions.map((champion) => (
              <button key={champion.id} type="button" className="kdb-champ" data-unowned={!champion.owned||undefined} onClick={() => setSelectedChampion(champion)}>
                <span className="kdb-champ__art">{champion.imageUrl ? <CardArtwork src={champion.imageUrl} loading="lazy" alt="" className="h-full w-full" imageDisplayMode={champion.imageDisplayMode} imageScale={champion.imageScale} imagePositionX={champion.imagePositionX} imagePositionY={champion.imagePositionY} /> : <Shield className="h-10 w-10" aria-hidden="true" />}</span>
                <span className="kdb-champ__plate"><strong>{champion.name}</strong><small>{champion.owned ? `능력 ${champion.abilityCost}골드${champion.hasQuest?' · 피니셔':''}` : '미보유 · 눌러서 제작'}</small></span>
                <span className="kdb-champ__text">{champion.owned ? (champion.abilityText || champion.description) : "상세 정보를 보고 챔피언 프리즘으로 만들 수 있어요."}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <CardDetailDialog
        card={selectedCard}
        open={Boolean(selectedCard)}
        onOpenChange={(open) => { if (!open) { const id=selectedCard?.id; setSelectedCard(null); if(id) requestAnimationFrame(()=>returnToCatalogCard(document.querySelector(`[data-motion-key="${CSS.escape(id)}"]`))); } }}
        quantityText={`보유 수량 ${collection?.isTestAccount ? "∞" : `×${selectedCard?.quantity ?? 0}`}`}
      >
        {selectedCard && (
          <div className="rounded border border-amber-800/50 bg-amber-950/20 p-3">
            <p className="text-xs font-black text-amber-200">프리즘 작업</p>
            {selectedSetting?.configured ? (
              <div className="mt-3 space-y-2 text-xs text-neutral-300">
                <p>제작 비용: <strong className="text-amber-200">{selectedSetting.craftCost!.toLocaleString()} 프리즘</strong></p>
                <p>분해 획득량: <strong className="text-emerald-300">{selectedSetting.disenchantReward!.toLocaleString()} 프리즘</strong></p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={isMutating || selectedCard.quantity >= maxCardCopies(selectedCard.rarity) || (!collection?.isTestAccount && prismBalance < selectedSetting.craftCost!)} onClick={() => setPendingAction({ type: "CRAFT", card: selectedCard, quantity: 1 })} className="flex items-center justify-center gap-2 rounded bg-amber-400 px-3 py-2.5 font-black text-black disabled:cursor-not-allowed disabled:opacity-40"><Hammer className="h-4 w-4" /> {selectedCard.quantity >= maxCardCopies(selectedCard.rarity) ? "제작 한도 도달" : "제작"}</button>
                   <button type="button" disabled={isMutating || selectedCard.quantity < 1} onClick={() => setPendingAction({ type: "DISENCHANT", card: selectedCard, quantity: 1 })} className="rounded border border-emerald-700 px-3 py-2.5 font-black text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">1장 분해</button>
                   <button type="button" disabled={isMutating || selectedExcess === 0} onClick={() => setPendingAction({ type: "DISENCHANT", card: selectedCard, quantity: selectedExcess, keepPlayableCopies: true })} className="rounded border border-emerald-700 px-3 py-2.5 font-black text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">최대 분해 ({maxCardCopies(selectedCard.rarity)}장 유지)</button>
                   <div className="sm:col-span-2 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-950/70 px-3 py-2">
                     <label htmlFor="disassembly-quantity" className="shrink-0 text-[11px] font-bold text-neutral-400">수량</label>
                     <input
                       id="disassembly-quantity"
                       type="number"
                       min={1}
                       max={selectedCard.quantity}
                       step={1}
                       value={safeDisassemblyQuantity}
                       onChange={(event) => setDisassemblyQuantity(Number(event.target.value) || 1)}
                       className="w-full min-w-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm font-black text-white outline-none focus:border-emerald-400"
                       aria-label="분해 수량"
                     />
                     <span className="shrink-0 text-[11px] text-neutral-500">/ {selectedCard.quantity}</span>
                     <button type="button" disabled={isMutating || selectedCard.quantity < 1} onClick={() => setPendingAction({ type: "DISENCHANT", card: selectedCard, quantity: safeDisassemblyQuantity })} className="shrink-0 rounded bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">분해</button>
                   </div>
                </div>
                {!collection?.isTestAccount && prismBalance < selectedSetting.craftCost! && <p className="text-[11px] text-red-300">프리즘이 부족합니다.</p>}
                {selectedCard.quantity < 1 && <p className="text-[11px] text-neutral-500">소유한 카드가 있어야 분해할 수 있습니다.</p>}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-amber-200">관리자 프리즘 설정이 없어 제작/분해를 사용할 수 없습니다.</p>
            )}
          </div>
        )}
      </CardDetailDialog>

       <Dialog open={Boolean(selectedChampion)} onOpenChange={(open) => { if (!open) setSelectedChampion(null); }}>
        <DialogContent className="border-neutral-800 bg-neutral-950 text-white sm:max-w-2xl">
           {selectedChampion && (
             <ChampionDetail
               champion={selectedChampion}
               setting={collection.championPrismSetting}
               balance={championPrismBalance}
               unlimited={collection.isTestAccount}
               isMutating={isMutating}
               onCraft={() => setPendingAction({ type: "CHAMPION_CRAFT", champion: selectedChampion })}
             />
           )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open && !isMutating) setPendingAction(null); }}>
        <DialogContent overlayClassName="!z-[240]" className="!z-[250] border-neutral-800 bg-neutral-950 text-white sm:max-w-md">
          {pendingAction && (
            <>
              <DialogHeader>
                 <DialogTitle className="text-left text-xl font-black">{pendingAction.type === "CRAFT" ? "카드 제작 확인" : pendingAction.type === "DISENCHANT" ? "카드 분해 확인" : "챔피언 제작 확인"}</DialogTitle>
                <DialogDescription className="whitespace-pre-line text-left text-sm leading-6 text-neutral-400">
                   {pendingAction.type === "CRAFT"
                    ? `${selectedSetting?.craftCost?.toLocaleString() ?? "—"} 프리즘을 사용해\n${pendingAction.card.name} 카드를 제작하시겠습니까?`
                     : pendingAction.type === "DISENCHANT"
                       ? `이 카드를 ${pendingAction.quantity}장 분해하고\n${((selectedSetting?.disenchantReward ?? 0) * pendingAction.quantity).toLocaleString()} 프리즘을 획득하시겠습니까?`
                       : `${collection.championPrismSetting.craftCost?.toLocaleString() ?? "—"} 챔피언 프리즘을 사용해\n${pendingAction.champion.name}을 제작하시겠습니까?`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <button type="button" disabled={isMutating} onClick={() => setPendingAction(null)} className="flex-1 rounded border border-neutral-700 px-4 py-3 text-sm font-black text-neutral-300">취소</button>
                 <button type="button" disabled={isMutating} onClick={() => void executePendingAction()} className="flex-1 rounded bg-amber-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50">{isMutating ? "처리 중..." : pendingAction.type === "CRAFT" || pendingAction.type === "CHAMPION_CRAFT" ? "제작" : "분해"}</button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {actionScene && <CollectionActionAnimation scene={actionScene} onComplete={() => setActionScene(null)} />}
    </main>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full appearance-none rounded border border-neutral-700 bg-neutral-950 py-2.5 pl-3 pr-8 text-xs font-bold text-neutral-200 outline-none focus:border-amber-400 sm:w-auto">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
    </label>
  );
}

function ChampionDetail({
  champion,
  setting,
  balance,
  unlimited,
  isMutating,
  onCraft,
}: {
  champion: CollectionChampion;
  setting: ChampionPrismSetting;
  balance: number;
  unlimited: boolean;
  isMutating: boolean;
  onCraft: () => void;
}) {
  const [tokenDetail, setTokenDetail] = useState<import("@/components/card-detail-dialog").CardDetailRecord | null>(null);
  const preparation=championPreparationCopy(champion);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-left text-xl font-black">{champion.name}</DialogTitle>
        <DialogDescription className={`text-left text-xs ${champion.owned ? "text-emerald-300" : "text-neutral-400"}`}>{champion.owned ? "해금됨" : "미보유"} · 기본 체력 {champion.maxHealth}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 sm:grid-cols-[minmax(180px,280px)_1fr] sm:items-start">
        <div className="overflow-hidden rounded-lg border border-rose-900/70 bg-neutral-950">
          {champion.imageUrl ? (
            <CardArtwork
              src={champion.imageUrl}
              alt={champion.name}
              className="aspect-square w-full"
              imageDisplayMode={champion.imageDisplayMode}
              imageScale={champion.imageScale}
              imagePositionX={champion.imagePositionX}
              imagePositionY={champion.imagePositionY}
            />
          ) : <div className="flex aspect-square items-center justify-center text-rose-300"><Shield className="h-20 w-20" /></div>}
        </div>
        <div className="space-y-4">
          <InfoBlock icon={<Swords className="h-4 w-4" />} label={`고유 능력 · 비용 ${champion.abilityCost} 골드`} text={champion.abilityText || champion.description} />
          {champion.gameStartAbilityText && <InfoBlock label="게임 시작 능력" text={champion.gameStartAbilityText} />}
          {champion.hasQuest && <InfoBlock label="피니셔 준비" text={preparation.condition} />}
          {champion.hasQuest && preparation.reward && <InfoBlock label="피니셔 획득 / 현재 완료 효과" text={`${preparation.reward}${!preparation.linked && champion.upgradedAbilityText ? `\n\n강화 고유 능력\n${champion.upgradedAbilityText}` : ""}`} />}
          <RelatedCards id={champion.id} onSelect={setTokenDetail}/>
          <CardDetailDialog card={tokenDetail} open={Boolean(tokenDetail)} onOpenChange={open => {if(!open)setTokenDetail(null);}}/>
          <section className="rounded-lg border border-rose-800/60 bg-rose-950/20 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-rose-200">챔피언 프리즘 제작</p>
            <p className="mt-2 text-sm text-neutral-300">현재 보유량: <strong className="text-rose-200">{unlimited ? "∞" : balance.toLocaleString()}</strong> ◈</p>
            {setting.configured ? (
              <>
                <p className="mt-1 text-sm text-neutral-300">제작 비용: <strong className="text-rose-200">{setting.craftCost!.toLocaleString()} 챔피언 프리즘</strong></p>
                {champion.owned ? (
                  <p className="mt-3 rounded border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-300">이미 보유한 챔피언입니다.</p>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isMutating || champion.isCraftable === false || (!unlimited && balance < setting.craftCost!)}
                      onClick={onCraft}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-rose-400 px-3 py-2.5 font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Hammer className="h-4 w-4" /> {champion.isCraftable === false ? "제작 불가" : "챔피언 제작"}
                    </button>
                    {!unlimited && balance < setting.craftCost! && <p className="mt-2 text-[11px] text-red-300">챔피언 프리즘이 부족합니다.</p>}
                  </>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-rose-200">관리자 챔피언 프리즘 설정이 없어 제작을 사용할 수 없습니다.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function InfoBlock({ icon, label, text }: { icon?: React.ReactNode; label: string; text: string }) {
  return <section className="rounded-lg border border-neutral-800 bg-black/30 p-4"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">{icon}{label}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-200"><CardRulesText text={text}/></p></section>;
}

function CollectionLoading() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8 sm:py-8" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between border-b border-neutral-800 pb-5">
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded bg-neutral-800" />
            <div className="h-9 w-48 animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-72 max-w-full animate-pulse rounded bg-neutral-900" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-full bg-neutral-900" />
        </div>
        <p role="status" className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          컬렉션을 불러오는 중...
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="aspect-[2/3] animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/70" />
          ))}
        </div>
      </div>
    </main>
  );
}

function EmptyState({ title, children }: { title: string; children?:ReactNode }) {
  return <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-12 text-center text-sm text-neutral-300" role="status"><p>{title}</p>{children}</div>;
}

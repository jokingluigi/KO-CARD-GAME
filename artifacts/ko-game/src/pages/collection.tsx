import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowLeft, BookOpen, ChevronDown, Search, Shield, Swords, X } from "lucide-react";
import { CardRenderer } from "@/components/card-renderer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchCollection, type Collection, type CollectionCard, type CollectionChampion } from "@/lib/collection-client";

type CollectionTab = "cards" | "champions";
type CardTypeFilter = "ALL" | "WRESTLER" | "TECHNIQUE";
type RarityFilter = "ALL" | "NORMAL" | "LEGENDARY";
type CardSort = "COST" | "NAME" | "RARITY";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function rarityLabel(rarity: string) {
  return rarity === "LEGENDARY" ? "LEGENDARY" : "NORMAL";
}

function CardCollectionItem({ card, onOpen }: { card: CollectionCard; onOpen: () => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group min-w-0 cursor-pointer rounded-xl border border-neutral-800 bg-black/35 p-2 text-left transition hover:-translate-y-1 hover:border-amber-500/70 hover:bg-amber-950/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      aria-label={`${card.name} 카드 상세 보기`}
    >
      <div className="relative">
        <CardRenderer
          name={card.name}
          cost={card.cost}
          attack={card.attack}
          health={card.health}
          rulesText={card.text}
          imageUrl={card.imageUrl}
          rarity={card.rarity as "NORMAL" | "LEGENDARY"}
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
          ×{card.quantity}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2">
        <span className="truncate text-sm font-black text-white">{card.name}</span>
        <span className="shrink-0 text-[10px] font-bold text-neutral-500">{card.cardType}</span>
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
          <img src={champion.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-rose-300"><Shield className="h-12 w-12" /></div>
        )}
        <span className="absolute bottom-2 left-2 rounded bg-emerald-950/90 px-2 py-1 text-[10px] font-black text-emerald-300">해금됨</span>
      </div>
      <div className="p-4">
        <h3 className="font-black text-white">{champion.name}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">{champion.abilityText || champion.description}</p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-amber-300">기본 능력 · {champion.abilityName}</p>
      </div>
    </button>
  );
}

export default function CollectionPage() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [tab, setTab] = useState<CollectionTab>("cards");
  const [search, setSearch] = useState("");
  const [cardType, setCardType] = useState<CardTypeFilter>("ALL");
  const [rarity, setRarity] = useState<RarityFilter>("ALL");
  const [sort, setSort] = useState<CardSort>("COST");
  const [selectedCard, setSelectedCard] = useState<CollectionCard | null>(null);
  const [selectedChampion, setSelectedChampion] = useState<CollectionChampion | null>(null);
  const [message, setMessage] = useState("컬렉션을 불러오는 중...");

  useEffect(() => {
    let cancelled = false;
    fetchCollection()
      .then((nextCollection) => {
        if (!cancelled) {
          setCollection(nextCollection);
          setMessage("");
        }
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message.includes("로그인이 필요합니다")) {
          window.location.href = basePath;
          return;
        }
        setMessage(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return [...(collection?.cards ?? [])]
      .filter((card) => {
        if (cardType !== "ALL" && card.cardType !== cardType) return false;
        if (rarity !== "ALL" && card.rarity !== rarity) return false;
        return !normalizedSearch || card.name.toLocaleLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (sort === "NAME") return left.name.localeCompare(right.name, "ko");
        if (sort === "RARITY") return rarityLabel(left.rarity).localeCompare(rarityLabel(right.rarity)) || left.name.localeCompare(right.name, "ko");
        return left.cost - right.cost || left.name.localeCompare(right.name, "ko");
      });
  }, [cardType, collection?.cards, rarity, search, sort]);

  const champions = collection?.champions ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => { window.location.href = basePath; }} className="flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> 메인 메뉴
          </button>
          <button type="button" onClick={() => { window.location.href = `${basePath}/decks`; }} className="rounded bg-primary px-4 py-2.5 text-xs font-black text-black transition hover:bg-yellow-400">
            덱 편집
          </button>
        </div>

        <header className="mb-6 flex items-end justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">MY COLLECTION</p>
            <h1 className="mt-2 text-3xl font-black">내 컬렉션</h1>
            <p className="mt-2 text-sm text-neutral-500">보유한 카드와 해금한 챔피언만 확인할 수 있습니다.</p>
          </div>
          <BookOpen className="hidden h-8 w-8 text-amber-400 sm:block" />
        </header>

        {message && <p role="status" className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}

        <div className="mb-6 grid grid-cols-2 rounded-lg border border-neutral-800 bg-black/30 p-1">
          <button type="button" onClick={() => setTab("cards")} className={`rounded px-3 py-3 text-sm font-black transition ${tab === "cards" ? "bg-amber-400 text-black" : "text-neutral-400 hover:text-white"}`}>
            카드 <span className="ml-1 text-xs opacity-70">{collection?.cards.length ?? 0}</span>
          </button>
          <button type="button" onClick={() => setTab("champions")} className={`rounded px-3 py-3 text-sm font-black transition ${tab === "champions" ? "bg-amber-400 text-black" : "text-neutral-400 hover:text-white"}`}>
            챔피언 <span className="ml-1 text-xs opacity-70">{champions.length}</span>
          </button>
        </div>

        {tab === "cards" ? (
          <>
            <section aria-label="카드 검색 및 필터" className="mb-5 rounded-xl border border-neutral-800 bg-black/30 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="카드 이름 검색" aria-label="카드 이름 검색" className="w-full rounded border border-neutral-700 bg-neutral-950 py-2.5 pl-9 pr-9 text-sm text-white outline-none transition focus:border-amber-400" />
                  {search && <button type="button" aria-label="검색어 지우기" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"><X className="h-4 w-4" /></button>}
                </label>
                <FilterSelect label="카드 종류" value={cardType} onChange={(value) => setCardType(value as CardTypeFilter)} options={[["ALL", "전체 종류"], ["WRESTLER", "WRESTLER"], ["TECHNIQUE", "TECHNIQUE"]]} />
                <FilterSelect label="희귀도" value={rarity} onChange={(value) => setRarity(value as RarityFilter)} options={[["ALL", "전체 희귀도"], ["NORMAL", "NORMAL"], ["LEGENDARY", "LEGENDARY"]]} />
                <FilterSelect label="정렬" value={sort} onChange={(value) => setSort(value as CardSort)} options={[["COST", "Cost"], ["NAME", "Name"], ["RARITY", "Rarity"]]} />
              </div>
              <p className="mt-3 text-xs text-neutral-500"><span className="font-bold text-neutral-300">{filteredCards.length}</span>장의 카드 · 소유 카드만 표시</p>
            </section>

            {filteredCards.length === 0 ? (
              <EmptyState title={collection?.cards.length ? "조건에 맞는 카드가 없습니다." : "아직 보유한 카드가 없습니다."} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                {filteredCards.map((card) => <CardCollectionItem key={card.id} card={card} onOpen={() => setSelectedCard(card)} />)}
              </div>
            )}
          </>
        ) : (
          champions.length === 0 ? (
            <EmptyState title="아직 해금한 챔피언이 없습니다." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {champions.map((champion) => <ChampionCollectionItem key={champion.id} champion={champion} onOpen={() => setSelectedChampion(champion)} />)}
            </div>
          )
        )}
      </div>

      <Dialog open={Boolean(selectedCard)} onOpenChange={(open) => { if (!open) setSelectedCard(null); }}>
        <DialogContent className="border-neutral-800 bg-neutral-950 text-white sm:max-w-2xl">
          {selectedCard && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-black">{selectedCard.name}</DialogTitle>
                <DialogDescription className="text-left text-xs text-neutral-500">
                  {selectedCard.cardType} · {rarityLabel(selectedCard.rarity)} · 보유 수량 ×{selectedCard.quantity}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 sm:grid-cols-[minmax(180px,250px)_1fr] sm:items-start">
                <CardRenderer
                  name={selectedCard.name}
                  cost={selectedCard.cost}
                  attack={selectedCard.attack}
                  health={selectedCard.health}
                  rulesText={selectedCard.text}
                  imageUrl={selectedCard.imageUrl}
                  rarity={selectedCard.rarity as "NORMAL" | "LEGENDARY"}
                  imageDisplaySettings={{
                    imageDisplayMode: selectedCard.imageDisplayMode,
                    imageScale: selectedCard.imageScale,
                    imagePositionX: selectedCard.imagePositionX,
                    imagePositionY: selectedCard.imagePositionY,
                  }}
                  size="detail"
                  className="mx-auto w-full max-w-[250px]"
                />
                <div className="space-y-4 rounded-lg border border-neutral-800 bg-black/30 p-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Cost" value={String(selectedCard.cost)} />
                    <DetailStat label="Rarity" value={rarityLabel(selectedCard.rarity)} />
                    <DetailStat label="공격력" value={String(selectedCard.attack)} />
                    <DetailStat label="체력" value={String(selectedCard.health)} />
                  </div>
                  <div><p className="text-[10px] font-black tracking-wider text-neutral-500">카드 효과</p><p className="mt-2 leading-6 text-neutral-200">{selectedCard.text || "효과 없음"}</p></div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedChampion)} onOpenChange={(open) => { if (!open) setSelectedChampion(null); }}>
        <DialogContent className="border-neutral-800 bg-neutral-950 text-white sm:max-w-2xl">
          {selectedChampion && <ChampionDetail champion={selectedChampion} />}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded border border-neutral-700 bg-neutral-950 py-2.5 pl-3 pr-8 text-xs font-bold text-neutral-200 outline-none focus:border-amber-400 sm:w-auto">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
    </label>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-neutral-800 bg-neutral-950/70 p-3"><p className="text-[10px] font-black text-neutral-500">{label}</p><p className="mt-1 font-black text-amber-200">{value}</p></div>;
}

function ChampionDetail({ champion }: { champion: CollectionChampion }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-left text-xl font-black">{champion.name}</DialogTitle>
        <DialogDescription className="text-left text-xs text-emerald-300">해금됨 · 기본 체력 {champion.maxHealth}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 sm:grid-cols-[minmax(180px,280px)_1fr] sm:items-start">
        <div className="overflow-hidden rounded-lg border border-rose-900/70 bg-neutral-950">
          {champion.imageUrl ? <img src={champion.imageUrl} alt={champion.name} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-rose-300"><Shield className="h-20 w-20" /></div>}
        </div>
        <div className="space-y-4">
          <InfoBlock icon={<Swords className="h-4 w-4" />} label={`${champion.abilityName}${champion.abilityCost > 0 ? ` · ${champion.abilityCost} Cost` : ""}`} text={champion.abilityText || champion.description} />
          {champion.hasQuest && <InfoBlock label={champion.questName || "Quest"} text={champion.questText || "Quest 정보가 없습니다."} />}
          {champion.hasQuest && champion.questRewardText && <InfoBlock label="Quest 보상 / 강화 능력" text={`${champion.questRewardText}${champion.upgradedAbilityText ? `\n\n강화 능력: ${champion.upgradedAbilityName || ""}\n${champion.upgradedAbilityText}` : ""}`} />}
        </div>
      </div>
    </>
  );
}

function InfoBlock({ icon, label, text }: { icon?: React.ReactNode; label: string; text: string }) {
  return <section className="rounded-lg border border-neutral-800 bg-black/30 p-4"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300">{icon}{label}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-200">{text}</p></section>;
}

function EmptyState({ title }: { title: string }) {
  return <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-sm text-neutral-500">{title}</div>;
}
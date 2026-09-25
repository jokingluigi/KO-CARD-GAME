import { useEffect, useMemo, useState } from "react";
import { CardArtwork } from "@/components/card-artwork";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardTypeLabel } from "@/lib/display-labels";
import { canonicalCardTags } from "@/game/cards/tags";
import {
  fetchPublicCardTagCatalog,
} from "@/game/cards/published-cards";
import type { CardDefinition } from "@/game/cards/types";
import type { CardDetailRecord } from "@/components/card-detail-dialog";

type BrowseableCardDefinition = CardDefinition & {
  cardType: "WRESTLER" | "TECHNIQUE";
};

function hasBrowseableCardType(
  card: CardDefinition,
): card is BrowseableCardDefinition {
  return card.cardType === "WRESTLER" || card.cardType === "TECHNIQUE";
}

function toCardDetailRecord(card: BrowseableCardDefinition): CardDetailRecord {
  return {
    id: card.id,
    name: card.name,
    cardType: card.cardType,
    cost: card.cost,
    attack: card.attack,
    health: card.health,
    text: card.rulesText,
    rarity: card.rarity ?? "NORMAL",
    tags: card.tags ?? [],
    imageUrl: card.imageUrl ?? null,
    imageDisplayMode: card.imageDisplayMode ?? "COVER",
    imageScale: card.imageScale ?? 1,
    imagePositionX: card.imagePositionX ?? 50,
    imagePositionY: card.imagePositionY ?? 50,
  };
}

function rarityLabel(rarity: string | undefined) {
  return rarity === "LEGENDARY" ? "전설" : rarity === "CHAMPION" ? "챔피언" : "일반";
}

function TagCardButton({
  card,
  onSelect,
}: {
  card: BrowseableCardDefinition;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="tag-card-result"
      aria-label={`${card.name} 카드 상세 보기`}
      onClick={onSelect}
      className="group min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/70 p-2 text-left transition hover:border-cyan-400/70 hover:bg-cyan-950/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-950">
        <CardArtwork
          src={card.imageUrl}
          alt=""
          className="h-full w-full transition duration-200 group-hover:scale-[1.02]"
          imageDisplayMode={card.imageDisplayMode}
          imageScale={card.imageScale}
          imagePositionX={card.imagePositionX}
          imagePositionY={card.imagePositionY}
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/80 px-2 py-1 text-xs font-black text-white">
          비용 {card.cost}
        </span>
      </div>
      <span className="mt-2 block truncate text-sm font-black text-white">{card.name}</span>
      <span className="mt-1 block truncate text-[11px] font-bold text-neutral-400">
        {rarityLabel(card.rarity)} · {cardTypeLabel(card.cardType)}
      </span>
      {card.cardType === "WRESTLER" && (
        <span className="mt-1 block text-[11px] font-bold text-amber-200">
          공격력 {card.attack} · 체력 {card.health}
        </span>
      )}
    </button>
  );
}


export function CardTagExplorerDialog({
  tag,
  open,
  onOpenChange,
  onSelectCard,
}: {
  tag: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCard: (card: CardDetailRecord) => void;
}) {
  const [catalog, setCatalog] = useState<CardDefinition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchPublicCardTagCatalog()
      .then((cards) => {
        if (!cancelled) setCatalog(cards);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "공개 카드 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, retryAttempt]);

  const matchingCards = useMemo(() => {
    if (!catalog) return [];
    const canonicalTag = canonicalCardTags([tag])[0];
    if (!canonicalTag) return [];
    return catalog
      .filter(hasBrowseableCardType)
      .filter((card) => canonicalCardTags(card.tags).includes(canonicalTag))
      .sort((left, right) =>
        left.cost - right.cost ||
        left.name.localeCompare(right.name, "ko") ||
        left.id.localeCompare(right.id),
      );
  }, [catalog, tag]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="!z-[220]"
        className="!z-[230] !left-0 !top-auto !bottom-0 !translate-x-0 !translate-y-0 !max-h-[88dvh] !w-full !max-w-none !rounded-t-2xl border-neutral-700 bg-neutral-950 p-4 text-white sm:!left-1/2 sm:!top-1/2 sm:!bottom-auto sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!max-h-[88dvh] sm:!w-[min(1100px,calc(100vw-32px))] sm:!max-w-[1100px] sm:!rounded-xl sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="text-left text-xl font-black">
            {tag} 태그 카드
          </DialogTitle>
          <DialogDescription className="text-left text-xs text-neutral-400">
            {catalog
              ? `공개 카드 ${matchingCards.length}장`
              : "공개된 카드 목록에서 태그가 일치하는 카드를 찾습니다."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-neutral-400" role="status">
            공개 카드를 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-900/70 bg-red-950/30 p-4 text-center">
            <p className="text-sm text-red-200">{loadError}</p>
            <button
              type="button"
              className="mt-3 rounded border border-red-700 px-4 py-2 text-xs font-bold text-red-100 hover:bg-red-900/40"
              onClick={() => setRetryAttempt((attempt) => attempt + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : catalog && matchingCards.length === 0 ? (
          <div
            data-testid="tag-card-empty"
            className="rounded-lg border border-neutral-800 bg-black/30 px-4 py-10 text-center text-sm text-neutral-400"
          >
            이 태그가 지정된 공개 카드가 없습니다.
          </div>
        ) : (
          <div
            data-testid="tag-card-list"
            className="grid grid-cols-2 gap-3 overflow-y-auto pb-1 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4"
          >
            {matchingCards.map((card) => (
              <TagCardButton
                key={card.id}
                card={card}
                onSelect={() => onSelectCard(toCardDetailRecord(card))}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
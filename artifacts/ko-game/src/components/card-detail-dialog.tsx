import { useEffect, useState, type ReactNode } from "react";
import { CardRenderer } from "@/components/card-renderer";
import { CardTagExplorerDialog } from "@/components/card-tag-explorer-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardTypeLabel, normalizeCardRulesText } from "@/lib/display-labels";

export type CardDetailRecord = {
  id: string;
  name: string;
  cardType: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  rarity: string;
  tags?: string[];
  imageUrl: string | null;
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM" | string;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
};

function rarityLabel(rarity: string) {
  return rarity === "LEGENDARY" ? "LEGENDARY" : rarity === "CHAMPION" ? "CHAMPION" : "NORMAL";
}

export function CardDetailDialog({
  card,
  open,
  onOpenChange,
  quantityText,
  children,
}: {
  card: CardDetailRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quantityText?: string;
  children?: ReactNode;
}) {
  const [tagExplorer, setTagExplorer] = useState<string | null>(null);
  const [tagDetailCard, setTagDetailCard] = useState<CardDetailRecord | null>(null);

  useEffect(() => {
    setTagExplorer(null);
    setTagDetailCard(null);
  }, [card?.id, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setTagExplorer(null);
      setTagDetailCard(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="!z-[220]"
        className="!z-[230] max-h-[90dvh] max-w-[min(620px,calc(100vw-24px))] overflow-y-auto border-neutral-800 bg-neutral-950 text-white"
      >
        {card && (
          <>
            <DialogHeader>
              <DialogTitle className="text-left text-xl font-black">{card.name}</DialogTitle>
              <DialogDescription className="text-left text-xs text-neutral-500">
                {cardTypeLabel(card.cardType)} · {rarityLabel(card.rarity)}
                {quantityText ? ` · ${quantityText}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 sm:grid-cols-[minmax(220px,320px)_1fr] sm:items-start">
              <CardRenderer
                name={card.name}
                cardType={card.cardType as "WRESTLER" | "TECHNIQUE"}
                cost={card.cost}
                attack={card.attack}
                health={card.health}
                rulesText={card.text}
                imageUrl={card.imageUrl}
                rarity={card.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
                imageDisplaySettings={{
                  imageDisplayMode: card.imageDisplayMode as "COVER" | "CONTAIN" | "CUSTOM",
                  imageScale: card.imageScale,
                  imagePositionX: card.imagePositionX,
                  imagePositionY: card.imagePositionY,
                }}
                size="detail"
                className="mx-auto w-full max-w-[320px]"
              />
              <div className="space-y-4 rounded-lg border border-neutral-800 bg-black/30 p-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <DetailStat label="비용" value={String(card.cost)} />
                  <DetailStat label="희귀도" value={rarityLabel(card.rarity)} />
                  {card.cardType === "WRESTLER" && (
                    <>
                      <DetailStat label="공격력" value={String(card.attack)} />
                      <DetailStat label="체력" value={String(card.health)} />
                    </>
                  )}
                </div>
                {card.tags?.length ? (
                  <div>
                    <p className="text-[10px] font-black tracking-wider text-neutral-500">태그</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {card.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          data-testid="card-detail-tag"
                          aria-label={`${tag} 태그 카드 보기`}
                          onClick={() => setTagExplorer(tag)}
                          className="rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-1 text-xs font-bold text-amber-200 transition hover:border-cyan-400 hover:bg-cyan-950/60 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="text-[10px] font-black tracking-wider text-neutral-500">카드 효과</p>
                  <p className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">
                    {normalizeCardRulesText(card.text) || "효과 없음"}
                  </p>
                </div>
                {children}
              </div>
            </div>
            <CardTagExplorerDialog
              tag={tagExplorer ?? ""}
              open={tagExplorer !== null}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) setTagExplorer(null);
              }}
              onSelectCard={setTagDetailCard}
            />
            {tagDetailCard && (
              <CardDetailDialog
                card={tagDetailCard}
                open={Boolean(tagDetailCard)}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) setTagDetailCard(null);
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/70 p-3">
      <p className="text-[10px] font-black text-neutral-500">{label}</p>
      <p className="mt-1 font-black text-amber-200">{value}</p>
    </div>
  );
}
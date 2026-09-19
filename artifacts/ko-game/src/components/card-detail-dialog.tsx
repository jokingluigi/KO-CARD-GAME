import type { ReactNode } from "react";
import { CardRenderer } from "@/components/card-renderer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardTypeLabel, normalizeCardRulesText } from "@/lib/display-labels";

export type CardDetailRecord = {
  name: string;
  cardType: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  rarity: string;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(620px,calc(100vw-24px))] border-neutral-800 bg-neutral-950 text-white">
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
                  <DetailStat label="공격력" value={String(card.attack)} />
                  <DetailStat label="체력" value={String(card.health)} />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-wider text-neutral-500">카드 효과</p>
                  <p className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">
                    {normalizeCardRulesText(card.text) || "효과 없음"}
                  </p>
                </div>
                {children}
              </div>
            </div>
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
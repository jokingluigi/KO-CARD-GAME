import { useState } from "react";
import { CardDetailDialog } from "./card-detail-dialog";
import { CardArtwork } from "./card-artwork";
import {
  deckCounts,
  type ShopDeckProduct,
  type ShopDeckCard,
} from "@/lib/shop-decks-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function ShopDeckDetail({
  product,
  onClose,
}: {
  product: ShopDeckProduct;
  onClose: () => void;
}) {
  const [card, setCard] = useState<ShopDeckCard | null>(null);
  const counts = deckCounts(product.cardDefinitionIds);
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-neutral-700 bg-neutral-950 text-white">
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
            <DialogDescription>
              {product.description || "완성 덱 구성"}
            </DialogDescription>
          </DialogHeader>
          {product.imageUrl && (
            <div className="h-36">
              <CardArtwork
                src={product.imageUrl}
                alt="덱 대표 이미지"
                className="h-full w-full"
                imageDisplayMode="CONTAIN"
              />
            </div>
          )}
          <p>
            총 {product.cardDefinitionIds.length}장 ·{" "}
            {product.price.toLocaleString()} 크레딧
          </p>
          <p className="text-sm text-amber-200">
            {product.recommendedChampion
              ? `추천 챔피언: ${product.recommendedChampion.name}`
              : "추천 챔피언 없음"}{" "}
            ·{" "}
            {product.includeChampion
              ? "챔피언 함께 지급"
              : "챔피언 미포함 — 보유 챔피언 사용"}
          </p>
          <div className="space-y-1">
            {[...counts].map(([id, n]) => {
              const c = product.cards?.find((c) => c.id === id);
              return (
                <button
                  type="button"
                  key={id}
                  disabled={!c}
                  onClick={() => setCard(c!)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded border border-neutral-800 px-3 text-left hover:border-amber-500"
                >
                  <span className="min-w-0 break-words">
                    {c ? `${c.cost} · ${c.name}` : "사용 불가 카드"}
                  </span>
                  <span className="shrink-0 text-amber-300">×{n}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <CardDetailDialog
        card={card}
        open={!!card}
        onOpenChange={(open) => {
          if (!open) setCard(null);
        }}
      />
    </>
  );
}

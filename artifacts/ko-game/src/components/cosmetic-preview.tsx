import type {
  CosmeticCardPreview,
  CosmeticChampionPreview,
} from "@/lib/cosmetics-client";
import { CardRenderer } from "./card-renderer";
import { CardArtwork } from "./card-artwork";
import type { CosmeticItem } from "@workspace/cosmetics";
export function CosmeticPreview({
  item,
  cards = [],
  champions = [],
}: {
  item: CosmeticItem;
  cards?: CosmeticCardPreview[];
  champions?: CosmeticChampionPreview[];
}) {
  const card = cards.find((c) => c.id === item.targetId);
  const target =
    item.type === "CARD_SKIN"
      ? card
      : champions.find((c) => c.id === item.targetId);
  if (item.type === "CARD_SKIN" && card)
    return (
      <CardRenderer
        name={card.name}
        cardType="WRESTLER"
        cost={card.cost}
        attack={card.attack}
        health={card.health}
        rulesText={card.text}
        rarity={card.rarity}
        imageUrl={item.imageAssets.art ?? card.imageUrl}
        fallbackImageUrl={card.imageUrl}
        size="detail"
        className="w-full"
      />
    );
  return (
    <div
      className={
        item.type === "CARD_BACK"
          ? "mx-auto aspect-[5/7] w-32 border border-amber-700"
          : "relative h-52 w-full"
      }
    >
      <CardArtwork
        src={
          item.imageAssets.art ??
          item.imageAssets.portrait ??
          item.imageAssets.intro ??
          item.imageAssets.awakened
        }
        fallbackSrc={target?.imageUrl}
        alt={item.name}
        className="h-full w-full"
        imageDisplayMode="CONTAIN"
      />
    </div>
  );
}

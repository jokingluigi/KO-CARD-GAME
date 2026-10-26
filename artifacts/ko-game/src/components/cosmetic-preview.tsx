import type {
  CosmeticCardPreview,
  CosmeticChampionPreview,
} from "@/lib/cosmetics-client";
import { CardRenderer } from "./card-renderer";
import { CardArtwork } from "./card-artwork";
import { cosmeticAssetDisplay, type CosmeticItem } from "@workspace/cosmetics";
export function CosmeticPreview({
  item,
  cards = [],
  champions = [],
  compact = false,
}: {
  item: CosmeticItem;
  cards?: CosmeticCardPreview[];
  champions?: CosmeticChampionPreview[];
  compact?: boolean;
}) {
  const tokenAssets =
    item.type === "CHAMPION_SKIN"
      ? Object.entries(item.imageAssets).filter(([key]) =>
          key.startsWith("token:"),
        )
      : [];
  const paired = compact && tokenAssets.length > 0;
  const card = cards.find((c) => c.id === item.targetId);
  const target =
    item.type === "CARD_SKIN"
      ? card
      : champions.find((c) => c.id === item.targetId);
  if (item.type === "CARD_SKIN" && card)
    return (
      <CardRenderer
        name={card.name}
        cardType={card.cardType ?? "WRESTLER"}
        artworkDisplayOverride={cosmeticAssetDisplay(item.imageAssets,"art")}
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
    <div className={paired ? "grid grid-cols-2 items-start gap-2" : undefined}>
      <div
        className={
          item.type === "CARD_BACK"
            ? "mx-auto aspect-[5/7] w-32 border border-amber-700"
            : paired
              ? "relative h-32 w-full"
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
          displayOverride={cosmeticAssetDisplay(item.imageAssets,item.imageAssets.art ? "art" : item.imageAssets.portrait ? "portrait" : item.imageAssets.intro ? "intro" : "awakened")}
          imageDisplayMode="CONTAIN"
        />
      </div>
      {tokenAssets.map(([key, url]) => (
        <div key={key} className={paired ? "text-center" : "mt-2 text-center"}>
          <CardArtwork
            src={url}
            displayOverride={cosmeticAssetDisplay(item.imageAssets,key)}
            alt="세트 포함 토큰 스킨"
            className={paired ? "mx-auto h-32 w-full" : "mx-auto h-40 w-28"}
            imageDisplayMode="CONTAIN"
          />
          <p className="mt-1 text-xs text-amber-200">
            {paired
              ? "토큰 스킨 포함"
              : "챔피언 토큰 스킨 포함 · 장착 시 자동 적용"}
          </p>
        </div>
      ))}
    </div>
  );
}

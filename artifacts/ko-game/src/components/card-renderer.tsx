import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { CardArtwork } from "./card-artwork";
import {
  normalizeCardRarity,
  type CardRarity,
  type ImageDisplaySettings,
} from "../game/cards/types";

const frameAssetNames: Partial<Record<CardRarity, string>> = {
  NORMAL: "card-frame-normal.png",
  LEGENDARY: "card-frame-legendary.png",
  CHAMPION: "card-frame-champion.png",
};

function frameAssetUrl(rarity: CardRarity) {
  const fileName = frameAssetNames[rarity];
  return fileName
    ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}/assets/${fileName}`
    : null;
}

export type CardRendererSize = "hand" | "board" | "detail" | "admin";

export function CardRenderer({
  name,
  cost,
  attack,
  health,
  rulesText,
  imageUrl,
  rarity,
  imageDisplaySettings,
  size,
  className = "",
  showName = true,
  showCost = true,
  showRules = true,
  showStats = true,
  interactiveArtwork = false,
  showArtworkHint = false,
  onImagePositionChange,
  overlay,
  onClick,
  onKeyDown,
  tabIndex,
}: {
  name: string;
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  imageUrl?: string | null;
  rarity?: CardRarity | null;
  imageDisplaySettings?: Partial<ImageDisplaySettings>;
  size: CardRendererSize;
  className?: string;
  showName?: boolean;
  showCost?: boolean;
  showRules?: boolean;
  showStats?: boolean;
  interactiveArtwork?: boolean;
  showArtworkHint?: boolean;
  onImagePositionChange?: (
    position: Pick<ImageDisplaySettings, "imagePositionX" | "imagePositionY">,
  ) => void;
  overlay?: ReactNode;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  tabIndex?: number;
}) {
  const normalizedRarity = normalizeCardRarity(rarity);
  const frameUrl = frameAssetUrl(normalizedRarity);
  const nameClass =
    size === "admin"
      ? "text-sm"
      : size === "detail"
        ? "text-xs"
        : size === "board"
          ? "text-[8px] md:text-[10px]"
          : "text-[8px] md:text-[11px]";
  const rulesClass =
    size === "admin"
      ? "text-xs leading-relaxed"
      : size === "detail"
        ? "text-[9px] leading-tight"
        : size === "board"
          ? "text-[7px] leading-tight md:text-[9px]"
          : "text-[7px] leading-tight md:text-[9px]";
  const statClass =
    size === "admin"
      ? "text-lg"
      : size === "detail"
        ? "text-sm"
        : "text-[10px] md:text-sm";
  const style: CSSProperties = {
    aspectRatio: "1060 / 1484",
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`relative aspect-[1060/1484] select-none ${className}`}
      style={style}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[4%] bg-neutral-950">
        <CardArtwork
          src={imageUrl}
          alt={name || "카드 이미지"}
          className="absolute inset-0 h-full w-full"
          {...imageDisplaySettings}
          interactive={interactiveArtwork}
          showHint={showArtworkHint}
          onPositionChange={onImagePositionChange}
        />

        {!frameUrl && (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[4%] border-2 border-blue-600/70" />
        )}
        {frameUrl && (
          <img
            src={frameUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            draggable={false}
          />
        )}

        {showName && (
          <div className="pointer-events-none absolute left-[19%] right-[8%] top-[3.8%] z-20 flex h-[9%] items-center justify-center overflow-hidden px-[2%] text-center">
            <span className={`w-full truncate font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${nameClass}`}>
              {name || "카드 이름"}
            </span>
          </div>
        )}

        {showCost && (
          <div className="pointer-events-none absolute left-[5.5%] top-[4%] z-20 flex aspect-square w-[15.5%] items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            <span className={statClass}>{cost}</span>
          </div>
        )}

        {showRules && (
          <div className="pointer-events-none absolute bottom-[10.5%] left-[10%] right-[10%] top-[48%] z-20 flex items-center justify-center overflow-hidden text-center text-neutral-100">
            <span className={`line-clamp-6 w-full font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${rulesClass}`}>
              {rulesText || "효과 없음"}
            </span>
          </div>
        )}

        {showStats && (
          <>
            <div className="pointer-events-none absolute bottom-[3.3%] left-[5.5%] z-20 flex aspect-square w-[15.5%] items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
              <span className={statClass}>{attack}</span>
            </div>
            <div className="pointer-events-none absolute bottom-[3.3%] right-[5.5%] z-20 flex aspect-square w-[15.5%] items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
              <span className={statClass}>{health}</span>
            </div>
          </>
        )}

        {overlay && <div className="pointer-events-none absolute inset-0 z-30">{overlay}</div>}
      </div>
    </div>
  );
}
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

type FrameLayout = {
  name: {
    left: number;
    right: number;
    top: number;
    height: number;
  };
  cost: {
    centerX: number;
    centerY: number;
    size: number;
  };
  rules: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  attack: {
    centerX: number;
    centerY: number;
    size: number;
  };
  health: {
    centerX: number;
    centerY: number;
    size: number;
  };
};

// These coordinates are percentages of the 1060x1484 source frames. The
// values are based on the actual transparent openings in each PNG, not on
// the card's rendered pixel size.
const frameLayouts: Record<CardRarity, FrameLayout> = {
  NORMAL: {
    name: { left: 20, right: 7, top: 5.5, height: 7.8 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 12, right: 12, top: 68.5, bottom: 10.5 },
    attack: { centerX: 12.26, centerY: 86.52, size: 14 },
    health: { centerX: 87.66, centerY: 86.52, size: 14 },
  },
  LEGENDARY: {
    name: { left: 18.5, right: 7.5, top: 5.5, height: 8.2 },
    cost: { centerX: 12.74, centerY: 10.85, size: 14 },
    rules: { left: 11, right: 11, top: 59, bottom: 13.5 },
    attack: { centerX: 12.64, centerY: 85.45, size: 14 },
    health: { centerX: 85.75, centerY: 85.45, size: 14 },
  },
  // The champion frame has the same broad panel structure as the legendary
  // frame. It keeps its own entry so it can be tuned without touching card
  // data or the renderer call sites.
  CHAMPION: {
    name: { left: 18.5, right: 7.5, top: 5.5, height: 8.2 },
    cost: { centerX: 12.74, centerY: 10.85, size: 14 },
    rules: { left: 11, right: 11, top: 59, bottom: 13.5 },
    attack: { centerX: 12.64, centerY: 85.45, size: 14 },
    health: { centerX: 85.75, centerY: 85.45, size: 14 },
  },
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
  const frameLayout = frameLayouts[normalizedRarity];
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
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[2%] text-center"
            style={{
              left: `${frameLayout.name.left}%`,
              right: `${frameLayout.name.right}%`,
              top: `${frameLayout.name.top}%`,
              height: `${frameLayout.name.height}%`,
            }}
          >
            <span className={`w-full truncate font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${nameClass}`}>
              {name || "카드 이름"}
            </span>
          </div>
        )}

        {showCost && (
          <div
            className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
            style={{
              left: `${frameLayout.cost.centerX}%`,
              top: `${frameLayout.cost.centerY}%`,
              width: `${frameLayout.cost.size}%`,
            }}
          >
            <span className={statClass}>{cost}</span>
          </div>
        )}

        {showRules && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[5%] py-[3%] text-center text-neutral-100"
            style={{
              left: `${frameLayout.rules.left}%`,
              right: `${frameLayout.rules.right}%`,
              top: `${frameLayout.rules.top}%`,
              bottom: `${frameLayout.rules.bottom}%`,
            }}
          >
            <span className={`line-clamp-6 w-full font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${rulesClass}`}>
              {rulesText || "효과 없음"}
            </span>
          </div>
        )}

        {showStats && (
          <>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${frameLayout.attack.centerX}%`,
                top: `${frameLayout.attack.centerY}%`,
                width: `${frameLayout.attack.size}%`,
              }}
            >
              <span className={statClass}>{attack}</span>
            </div>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${frameLayout.health.centerX}%`,
                top: `${frameLayout.health.centerY}%`,
                width: `${frameLayout.health.size}%`,
              }}
            >
              <span className={statClass}>{health}</span>
            </div>
          </>
        )}

        {overlay && <div className="pointer-events-none absolute inset-0 z-30">{overlay}</div>}
      </div>
    </div>
  );
}
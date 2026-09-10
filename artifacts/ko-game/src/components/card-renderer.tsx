import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";
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
  scale: number;
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
    scale: 1.1,
    name: { left: 20, right: 7, top: 5.5, height: 7.8 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 12, right: 12, top: 68.5, bottom: 10.5 },
    attack: { centerX: 12.26, centerY: 86.52, size: 14 },
    health: { centerX: 87.66, centerY: 86.52, size: 14 },
  },
  LEGENDARY: {
    scale: 1.1,
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
    scale: 1.1,
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

function scalePercent(value: number, scale: number): number {
  return 50 + (value - 50) * scale;
}

function scaleInset(value: number, scale: number): number {
  return 100 - scalePercent(100 - value, scale);
}

function scaleSize(value: number, scale: number): number {
  return value * scale;
}

export type CardRendererSize = "hand" | "board" | "detail" | "admin";
export type CardHighlight = "selected" | "target" | "attack";

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
  highlight,
  onClick,
  onKeyDown,
  tabIndex,
  containerRef,
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
  highlight?: CardHighlight;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  tabIndex?: number;
  containerRef?: Ref<HTMLDivElement>;
}) {
  const normalizedRarity = normalizeCardRarity(rarity);
  const frameLayout = frameLayouts[normalizedRarity];
  const frameScale = frameLayout.scale;
  const frameUrl = frameAssetUrl(normalizedRarity);
  const nameClass =
    name.length > 22
      ? size === "admin"
        ? "text-[9px]"
        : "text-[5px] md:text-[6px]"
      : name.length > 14
        ? size === "admin"
          ? "text-[10px]"
          : "text-[6px] md:text-[7px]"
        : size === "admin"
          ? "text-[11px]"
      : size === "detail"
          ? "text-[9px]"
        : size === "board"
            ? "text-[6px] md:text-[8px]"
            : "text-[6px] md:text-[8px]";
  const rulesClass =
    size === "admin"
      ? "text-[10px] leading-tight"
      : size === "detail"
        ? "text-[8px] leading-tight"
        : size === "board"
          ? "text-[6px] leading-tight md:text-[8px]"
          : "text-[6px] leading-tight md:text-[8px]";
  const statClass =
    size === "admin"
      ? "text-base"
      : size === "detail"
        ? "text-xs"
        : "text-[9px] md:text-xs";
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
      className={`relative aspect-[1060/1484] overflow-visible select-none ${className}`}
      style={style}
      ref={containerRef}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex}
    >
      <div className="absolute inset-0 overflow-visible">
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
          <div className="pointer-events-none absolute inset-0 z-10" />
        )}
        {frameUrl && (
          <img
            src={frameUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            style={{
              transform: `scale(${frameScale})`,
              transformOrigin: "center",
              filter:
                highlight === "selected"
                  ? "drop-shadow(0 0 5px rgba(250, 204, 21, 0.95)) drop-shadow(0 0 12px rgba(250, 204, 21, 0.65))"
                  : highlight === "target"
                    ? "drop-shadow(0 0 5px rgba(248, 113, 113, 0.95)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.7))"
                    : highlight === "attack"
                      ? "drop-shadow(0 0 5px rgba(96, 165, 250, 0.95)) drop-shadow(0 0 12px rgba(59, 130, 246, 0.65))"
                      : undefined,
            }}
            draggable={false}
          />
        )}

        {showName && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[2%] text-center"
            style={{
              left: `${scaleInset(frameLayout.name.left, frameScale)}%`,
              right: `${scaleInset(frameLayout.name.right, frameScale)}%`,
              top: `${scaleInset(frameLayout.name.top, frameScale)}%`,
              height: `${scaleSize(frameLayout.name.height, frameScale)}%`,
            }}
          >
            <span className={`line-clamp-2 w-full break-words font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${nameClass}`}>
              {name || "카드 이름"}
            </span>
          </div>
        )}

        {showCost && (
          <div
            className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
            style={{
              left: `${scalePercent(frameLayout.cost.centerX, frameScale)}%`,
              top: `${scalePercent(frameLayout.cost.centerY, frameScale)}%`,
              width: `${scaleSize(frameLayout.cost.size, frameScale)}%`,
            }}
          >
            <span className={statClass}>{cost}</span>
          </div>
        )}

        {showRules && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[5%] py-[3%] text-center text-neutral-100"
            style={{
              left: `${scaleInset(frameLayout.rules.left, frameScale)}%`,
              right: `${scaleInset(frameLayout.rules.right, frameScale)}%`,
              top: `${scaleInset(frameLayout.rules.top, frameScale)}%`,
              bottom: `${scaleInset(frameLayout.rules.bottom, frameScale)}%`,
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
                left: `${scalePercent(frameLayout.attack.centerX, frameScale)}%`,
                top: `${scalePercent(frameLayout.attack.centerY, frameScale)}%`,
                width: `${scaleSize(frameLayout.attack.size, frameScale)}%`,
              }}
            >
              <span className={statClass}>{attack}</span>
            </div>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${scalePercent(frameLayout.health.centerX, frameScale)}%`,
                top: `${scalePercent(frameLayout.health.centerY, frameScale)}%`,
                width: `${scaleSize(frameLayout.health.size, frameScale)}%`,
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
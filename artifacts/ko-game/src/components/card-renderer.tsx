import { configuredCountdownTurns } from '@workspace/effect-registry';
import { getCardDefinitions } from '../game/cards/test-cards';
import { repairedLegacyCardKeywords } from '../game/cards/legacy-card-effect-repair';
import { MotionNumber } from './presentation-motion';
import { CardRulesText } from './card-rules-text';
import { useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { CardArtwork } from "./card-artwork";
import { KEYWORD_DESCRIPTIONS } from './alt-inspector-utils';
import {
  getVisibleCardKeywords,
  getVisibleCardRulesText,
  KEYWORD_RULE_LABELS,
} from "@/lib/card-display-state";
import {
  normalizeCardRarityForType,
  type CardRarity,
  type CardKeyword,
  type ImageDisplaySettings,
} from "../game/cards/types";
import {
  useCardFrameDefinition,
  type CardFrameCardType,
  type CardFrameDefinition,
} from "../lib/card-frames-client";

const frameAssetNames: Partial<Record<CardRarity, string>> = {
  NORMAL: "card-frame-normal.png",
  // Temporary base artwork; the rarity badge distinguishes EPIC.
  EPIC: "card-frame-normal.png",
  LEGENDARY: "card-frame-legendary.png",
  CHAMPION: "card-frame-champion.png",
};

const rarityBadgeColors: Record<CardRarity, string> = {
  NORMAL: "bg-neutral-900 text-neutral-200",
  EPIC: "bg-violet-950 text-violet-200",
  LEGENDARY: "bg-amber-950 text-amber-200",
  CHAMPION: "bg-red-950 text-red-200",
  TOKEN: "bg-emerald-950 text-emerald-200",
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
  EPIC: {
    scale: 1.1, name: { left: 20, right: 7, top: 5.5, height: 7.8 },
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
  TOKEN: {
    scale: 1.1,
    name: { left: 20, right: 7, top: 5.5, height: 7.8 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 12, right: 12, top: 68.5, bottom: 10.5 },
    attack: { centerX: 12.26, centerY: 86.52, size: 14 },
    health: { centerX: 87.66, centerY: 86.52, size: 14 },
  },
};

function frameAssetUrl(rarity: CardRarity) {
  const fileName = frameAssetNames[rarity];
  return fileName
    ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}/assets/${fileName}`
    : null;
}

function scalePercent(value: number, scale: number, offset = 0): number {
  return 50 + (value - 50) * scale + offset;
}

function scaleInset(value: number, scale: number, offset = 0): number {
  return 100 - scalePercent(100 - value, scale, offset);
}

function scaleSize(value: number, scale: number): number {
  return value * scale;
}

export type CardRendererSize = "hand" | "board" | "detail" | "admin";
export type CardHighlight = "selected" | "target" | "attack";

export function CardRenderer({
  cardId,
  name,
  cardType,
  cost,
  attack,
  health,
  rulesText,
  imageUrl,
  rarity,
  frameOverride,
  imageDisplaySettings,
  size,
  className = "",
  showName = true,
  showCost = true,
  showRules = true,
  showStats = true,
  interactiveArtwork = false,
  showArtworkHint = false,
  artworkLoading = "eager",
  onImagePositionChange,
  overlay,
  highlight,
  runtimeKeywords,
  keywords = [],
  keywordConfig,
  isSilenced = false,
  isStunned = false,
  isAbilityDisabled = false,
  dodgeCharges,
  countdownRemaining,
  countdownResolved = false,
  countdownTurns,
  isChampionToken = false,
  onClick,
  onKeyDown,
  tabIndex,
  containerRef,
}: {
  cardId?: string;
  name: string;
  cardType?: CardFrameCardType;
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  imageUrl?: string | null;
  rarity?: CardRarity | null;
  frameOverride?: Partial<CardFrameDefinition>;
  imageDisplaySettings?: Partial<ImageDisplaySettings>;
  size: CardRendererSize;
  className?: string;
  showName?: boolean;
  showCost?: boolean;
  showRules?: boolean;
  showStats?: boolean;
  interactiveArtwork?: boolean;
  showArtworkHint?: boolean;
  artworkLoading?: "eager" | "lazy";
  onImagePositionChange?: (
    position: Pick<ImageDisplaySettings, "imagePositionX" | "imagePositionY">,
  ) => void;
  overlay?: ReactNode;
  highlight?: CardHighlight;
  runtimeKeywords?: CardKeyword[];
  keywords?: CardKeyword[];
  keywordConfig?: Record<string, unknown> | null;
  isSilenced?: boolean;
  isStunned?: boolean;
  isAbilityDisabled?: boolean;
  dodgeCharges?: number;
  countdownRemaining?: number;
  countdownResolved?: boolean;
  countdownTurns?: number;
  isChampionToken?: boolean;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  tabIndex?: number;
  containerRef?: Ref<HTMLDivElement>;
}) {
  const visibleDodgeCharges = dodgeCharges ?? (runtimeKeywords === undefined
    ? typeof keywordConfig?.dodgeCharges === 'number' ? keywordConfig.dodgeCharges : 1
    : 0);
  const visibleRuntimeKeywords = getVisibleCardKeywords(
    runtimeKeywords ?? repairedLegacyCardKeywords({ id: cardId ?? '', text: rulesText, keywords }),
    isSilenced,
    visibleDodgeCharges,
  );
  const [keywordExplanation, setKeywordExplanation] = useState<string | null>(null);
  const displayRulesTextWithoutArmor = getVisibleCardRulesText(
    rulesText,
    visibleRuntimeKeywords,
  );
  const armorValue = keywordConfig?.armor ?? getCardDefinitions().find(card => card.name === name)?.effectConfig?.armor;
  const countdownValue = countdownRemaining ?? configuredCountdownTurns({countdownTurns:countdownTurns ?? keywordConfig?.countdownTurns ?? getCardDefinitions().find(card=>card.name===name)?.effectConfig?.countdownTurns});
  const armoredRulesText = typeof armorValue === 'number' ? displayRulesTextWithoutArmor.replace(/아머(?!\s*\()/g, `아머(${armorValue})`) : displayRulesTextWithoutArmor;
  const displayRulesText = visibleRuntimeKeywords.includes('COUNTDOWN') ? armoredRulesText.replace(/카운트다운(?:\s*\(\d+\)|\s+\d+\s*턴)?/g, `카운트다운(${countdownValue})`) : armoredRulesText;
  const normalizedRarity = isChampionToken
    ? cardType === "TECHNIQUE" ? "TOKEN" : "CHAMPION"
    : normalizeCardRarityForType(cardType, rarity);
  const normalizedCardType = cardType ?? "WRESTLER";
  // Content coordinates are canonical for every WRESTLER frame. Only the
  // frame artwork changes by rarity; frame offsets remain independent.
  const layoutRarity = normalizedCardType === "WRESTLER"
    ? "NORMAL"
    : normalizedRarity === "TOKEN"
      ? "NORMAL"
      : normalizedRarity;
  const remoteFrame = useCardFrameDefinition(normalizedCardType, normalizedRarity);
  const frameSettings = frameOverride?.enabled === false
    ? null
    : frameOverride
      ? { ...remoteFrame, ...frameOverride }
      : remoteFrame;
  const frameLayout = frameLayouts[layoutRarity];
  const frameScale = frameSettings?.frameScale ?? frameLayout.scale;
  const frameOffsetX = frameSettings?.frameOffsetX ?? 0;
  const frameOffsetY = frameSettings?.frameOffsetY ?? 0;
  const bundledFrameUrl = frameAssetUrl(layoutRarity);
  const [frameFailed, setFrameFailed] = useState(false);
  useEffect(() => {
    setFrameFailed(false);
  }, [frameSettings?.frameUrl, normalizedCardType, normalizedRarity]);
  const frameUrl = frameFailed ? bundledFrameUrl : frameSettings?.frameUrl ?? bundledFrameUrl;
  const keywordBadges = [
    ...visibleRuntimeKeywords,
    ...(isSilenced ? ["SILENCE" as CardKeyword] : []),
    ...(isStunned ? ["STUN" as CardKeyword] : []),
    ...(isAbilityDisabled ? ["DISABLED" as CardKeyword] : []),
  ].filter((keyword, index, all) => all.indexOf(keyword) === index);
  const keywordLabels: Record<string, string> = {
    ...KEYWORD_RULE_LABELS,
    TAUNT: "도발",
    RUSH: "러쉬",
    SURPRISE: "기습",
    DODGE: visibleDodgeCharges > 1 ? `회피 ×${visibleDodgeCharges}` : "회피",
    ARMOR: typeof armorValue === 'number' ? `아머(${armorValue})` : '아머',
    COUNTDOWN: countdownResolved ? '카운트다운 · 발동 완료' : `카운트다운(${countdownValue})`,
    STUN: "기절",
    SILENCE: "침묵",
    DISABLED: "봉인",
    MULTI_STRIKE: "연타",
  };
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
      ? "text-lg"
      : size === "detail"
        ? "text-sm"
        : "text-[11px] md:text-sm";
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
      data-rarity={normalizedRarity}
      data-targetable={highlight === "target"}
      style={style}
      ref={containerRef}
             onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex}
      data-gamepad-target={onClick ? '' : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? name : undefined}
    >
      <div className="absolute inset-0 overflow-visible">
        <CardArtwork
          src={imageUrl}
          loading={artworkLoading}
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
              transform: `translate(${frameOffsetX}%, ${frameOffsetY}%) scale(${frameScale})`,
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
            onError={() => setFrameFailed(true)}
            draggable={false}
          />
        )}

        {showName && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[2%] text-center"
            style={{
              left: `${scaleInset(frameLayout.name.left, frameScale, frameOffsetX)}%`,
              right: `${scaleInset(frameLayout.name.right, frameScale, -frameOffsetX)}%`,
              top: `${scaleInset(frameLayout.name.top, frameScale, frameOffsetY)}%`,
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
              left: `${scalePercent(frameLayout.cost.centerX, frameScale, frameOffsetX)}%`,
              top: `${scalePercent(frameLayout.cost.centerY, frameScale, frameOffsetY)}%`,
              width: `${scaleSize(frameLayout.cost.size, frameScale)}%`,
            }}
          >
            <MotionNumber className={statClass} value={cost} />
          </div>
        )}

        {showRules && (
          <div
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[5%] py-[3%] text-center text-neutral-100"
            style={{
              left: `${scaleInset(frameLayout.rules.left, frameScale, frameOffsetX)}%`,
              right: `${scaleInset(frameLayout.rules.right, frameScale, -frameOffsetX)}%`,
              top: `${scaleInset(frameLayout.rules.top, frameScale, frameOffsetY)}%`,
              bottom: `${scaleInset(frameLayout.rules.bottom, frameScale, -frameOffsetY)}%`,
            }}
          >
            <span className={`line-clamp-6 w-full font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${rulesClass}`}>
              <CardRulesText text={displayRulesText || "효과 없음"}/>
            </span>
          </div>
        )}

        {keywordExplanation && <button type="button" className="absolute bottom-[18%] left-[7%] right-[7%] z-50 rounded border border-amber-400 bg-neutral-950/95 p-1 text-center text-[clamp(9px,1vw,12px)] leading-tight text-white shadow-lg"
          onClick={(event) => { event.stopPropagation(); setKeywordExplanation(null); }} aria-label="키워드 설명 닫기">{keywordExplanation} ×</button>}

        {showStats && normalizedCardType === "WRESTLER" && (
          <>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${scalePercent(frameLayout.attack.centerX, frameScale, frameOffsetX)}%`,
                top: `${scalePercent(frameLayout.attack.centerY, frameScale, frameOffsetY)}%`,
                width: `${scaleSize(frameLayout.attack.size, frameScale)}%`,
              }}
            >
            <MotionNumber className={`${statClass} text-amber-300`} value={attack} />
            </div>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${scalePercent(frameLayout.health.centerX, frameScale, frameOffsetX)}%`,
                top: `${scalePercent(frameLayout.health.centerY, frameScale, frameOffsetY)}%`,
                width: `${scaleSize(frameLayout.health.size, frameScale)}%`,
              }}
            >
              <MotionNumber className={`${statClass} text-red-400`} value={health} />
            </div>
          </>
        )}

        <div className="pointer-events-none absolute right-[5%] top-[15%] z-30 flex max-w-[52%] flex-col items-end gap-1">
          <span className={`max-w-full break-all rounded px-1 text-[8px] font-black leading-tight ${rarityBadgeColors[normalizedRarity]}`}>
            {normalizedRarity}
          </span>
        {keywordBadges.length > 0 && (
             <div
            data-testid="card-keyword-badges"
             className="flex max-w-full flex-wrap justify-end gap-0.5"
            aria-label={`키워드 ${keywordBadges.map((keyword) => keywordLabels[keyword] ?? keyword).join(", ")}`}
          >
            {keywordBadges.map((keyword) => (
              <span
                key={keyword}
                 className={`max-w-full rounded border px-0.5 py-0.5 text-[clamp(0.45rem,0.7vw,0.65rem)] font-extrabold leading-none shadow-lg ${
                  keyword === "TAUNT" ? "border-cyan-200 bg-cyan-950/90 text-cyan-100" :
                  keyword === "RUSH" ? "border-amber-200 bg-amber-950/90 text-amber-100" :
                  keyword === "SURPRISE" ? "border-fuchsia-200 bg-fuchsia-950/90 text-fuchsia-100" :
                  keyword === "DODGE" ? "border-violet-200 bg-violet-950/90 text-violet-100" :
                  String(keyword) === "STUN" ? "border-orange-200 bg-orange-950/90 text-orange-100" :
                  String(keyword) === "SILENCE" ? "border-purple-200 bg-purple-950/90 text-purple-100" :
                  String(keyword) === "DISABLED" ? "border-slate-200 bg-slate-950/90 text-slate-100" :
                  "border-red-200 bg-red-950/90 text-red-100"
                }`}
                title={keywordLabels[keyword] ?? keyword}
              >
                {keywordLabels[keyword] ?? keyword}
              </span>
            ))}
          </div>
        )}
        </div>

        {overlay && <div className="pointer-events-none absolute inset-0 z-30">{overlay}</div>}
      </div>
    </div>
  );
}

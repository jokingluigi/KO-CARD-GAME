import "./card-foil.css";
import {FittedCardName} from "./fitted-card-name";
import {frameWindowsFromImage,type DetectedFrameWindows} from "@/lib/card-frame-windows";
import {cardSilenceProtection} from '../lib/card-protection-display';
import {SILENCE_IMMUNITY_DESCRIPTION} from './silence-immunity-notice';
import {getCardDefinition} from '../game/cards/test-cards';
import {rememberCardOrigin} from "./physical-feedback";
import "./physical-card.css";
import {useCosmeticImage} from './cosmetic-battle';
import { configuredCountdownTurns, upgradeDisplayText } from '@workspace/effect-registry';
import { getCardDefinitions } from '../game/cards/test-cards';
import { repairedLegacyCardKeywords } from '../game/cards/legacy-card-effect-repair';
import { MotionNumber } from './presentation-motion';
import { CardRulesText } from './card-rules-text';
import { FittedCardRules, FittedCardRulesContext } from './fitted-card-rules';
import { useContext, useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { CardArtwork } from "./card-artwork";
import { KeywordFx, type MessengerKind } from "./keyword-fx";
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
  NORMAL: "card-frame-normal.webp",
  // Temporary base artwork; the rarity badge distinguishes EPIC.
  EPIC: "card-frame-normal.webp",
  LEGENDARY: "card-frame-legendary.webp",
  CHAMPION: "card-frame-champion.webp",
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
    name: { left: 26, right: 12, top: 7.2, height: 5.6 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 20, right: 20, top: 70.5, bottom: 13.5 },
    attack: { centerX: 12.26, centerY: 86.52, size: 14 },
    health: { centerX: 87.66, centerY: 86.52, size: 14 },
  },
  EPIC: {
    scale: 1.1, name: { left: 26, right: 12, top: 7.2, height: 5.6 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 20, right: 20, top: 70.5, bottom: 13.5 },
    attack: { centerX: 12.26, centerY: 86.52, size: 14 },
    health: { centerX: 87.66, centerY: 86.52, size: 14 },
  },
  LEGENDARY: {
    scale: 1.1,
    name: { left: 26, right: 13, top: 8.5, height: 5.2 },
    cost: { centerX: 12.74, centerY: 10.85, size: 14 },
    rules: { left: 21, right: 21, top: 64, bottom: 14 },
    attack: { centerX: 12.64, centerY: 85.45, size: 14 },
    health: { centerX: 85.75, centerY: 85.45, size: 14 },
  },
  // Crown and lower description plate have different bounds on the champion frame.
  CHAMPION: {
    scale: 1.1,
    name: { left: 26, right: 18, top: 10.5, height: 4.4 },
    cost: { centerX: 13.2, centerY: 11.51, size: 14 },
    rules: { left: 21, right: 21, top: 69, bottom: 15 },
    attack: { centerX: 13.1, centerY: 84.13, size: 14 },
    health: { centerX: 86.58, centerY: 84.12, size: 14 },
  },
  TOKEN: {
    scale: 1.1,
    name: { left: 26, right: 12, top: 7.2, height: 5.6 },
    cost: { centerX: 13.68, centerY: 10.04, size: 14 },
    rules: { left: 20, right: 20, top: 70.5, bottom: 13.5 },
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

/** 카드별 마우스 위치 처리 상태 (화면 그리기 한 번에 한 번만 반영). */
const pointerFx = new WeakMap<HTMLElement, { rect: DOMRect; x: number; y: number; frame: number }>();

export function CardRenderer({
  cardId,
  name,
  cardType,
  cost,
  attack,
  health,
  rulesText,
  imageUrl,
  fallbackImageUrl,
  cosmeticOwnerId,
  rarity,
  frameOverride,
  imageDisplaySettings,
  artworkDisplayOverride,
  size,
  className = "",
  showName = true,
  showCost = true,
  showRules = true,
  showStats = true,
  interactiveArtwork = false,
  showArtworkHint = false,
  artworkLoading = "eager",
  rulesOverflow = "scroll",
  onImagePositionChange,
  overlay,
  highlight,
  runtimeKeywords,
  messenger,
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
  isToken = false,
  isSilenceImmune = false,
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
  fallbackImageUrl?: string | null;
  cosmeticOwnerId?: string;
  rarity?: CardRarity | null;
  frameOverride?: Partial<CardFrameDefinition>;
  imageDisplaySettings?: Partial<ImageDisplaySettings>;
  artworkDisplayOverride?: Partial<ImageDisplaySettings>;
  size: CardRendererSize;
  className?: string;
  showName?: boolean;
  showCost?: boolean;
  showRules?: boolean;
  showStats?: boolean;
  interactiveArtwork?: boolean;
  showArtworkHint?: boolean;
  artworkLoading?: "eager" | "lazy";
  /** 큰 카드에서 효과가 넘칠 때: scroll=상자 안 스크롤(기본), clip=읽을 수 있는 크기까지만 줄이고 "…"로 끝냄(목록용). */
  rulesOverflow?: "scroll" | "clip";
  onImagePositionChange?: (
    position: Pick<ImageDisplaySettings, "imagePositionX" | "imagePositionY">,
  ) => void;
  overlay?: ReactNode;
  highlight?: CardHighlight;
  runtimeKeywords?: CardKeyword[];
  /** Angel "사자" appointment carried by a field card. */
  messenger?: MessengerKind;
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
  isToken?:boolean;
  isSilenceImmune?:boolean;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  tabIndex?: number;
  containerRef?: Ref<HTMLDivElement>;
}) {
  const cosmetic = useCosmeticImage(cosmeticOwnerId,cardId,'CARD_SKIN',imageUrl);
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
  const displayRulesText = upgradeDisplayText(visibleRuntimeKeywords.includes('COUNTDOWN') ? armoredRulesText.replace(/카운트다운(?:\s*\(\d+\)|\s+\d+\s*턴)?/g, `카운트다운(${countdownValue})`) : armoredRulesText);
  const normalizedRarity = isChampionToken && cardType !== "TECHNIQUE"
    ? "CHAMPION"
    : normalizeCardRarityForType(cardType, rarity, { isChampionToken });
  const normalizedCardType = cardType ?? "WRESTLER";
  // Every rarity uses the coordinates of its own bundled artwork.
  const layoutRarity = normalizedRarity === "TOKEN" ? "NORMAL" : normalizedRarity;
  const remoteFrame = useCardFrameDefinition(normalizedCardType, normalizedRarity);
  const frameSettings = frameOverride?.enabled === false
    ? null
    : frameOverride
      ? { ...remoteFrame, ...frameOverride }
      : remoteFrame;
  const baseFrameLayout = frameLayouts[layoutRarity];
  const [detectedFrame,setDetectedFrame]=useState<{src:string;windows:DetectedFrameWindows}|null>(null);
  const frameScale = frameSettings?.frameScale ?? baseFrameLayout.scale;
  const frameOffsetX = frameSettings?.frameOffsetX ?? 0;
  const frameOffsetY = frameSettings?.frameOffsetY ?? 0;
  const bundledFrameUrl = frameAssetUrl(layoutRarity);
  const [frameFailed, setFrameFailed] = useState(false);
  useEffect(() => {
    setFrameFailed(false);
  }, [frameSettings?.frameUrl, normalizedCardType, normalizedRarity]);
  const frameUrl = frameFailed ? bundledFrameUrl : frameSettings?.frameUrl ?? bundledFrameUrl;
  const windows=frameSettings?.frameUrl && detectedFrame?.src===frameUrl ? detectedFrame.windows : null;
  const frameLayout=windows?{...baseFrameLayout,...windows}:baseFrameLayout;
  const artCutout=windows?.opaqueArtWindow;
  const cutout=artCutout?`polygon(evenodd,0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${artCutout.left}% ${artCutout.top}%,${100-artCutout.right}% ${artCutout.top}%,${100-artCutout.right}% ${100-artCutout.bottom}%,${artCutout.left}% ${100-artCutout.bottom}%,${artCutout.left}% ${artCutout.top}%)`:undefined;

  const silenceProtection=cardSilenceProtection({rarity,isToken,isChampionToken,isSilenceImmune},cardId?getCardDefinition(cardId):undefined);
  const keywordBadges: string[] = [
    ...(silenceProtection.immune?["SILENCE_IMMUNE"]:[]),
    ...visibleRuntimeKeywords,
    ...(isSilenced ? ["SILENCE" as CardKeyword] : []),
    ...(isStunned ? ["STUN" as CardKeyword] : []),
    ...(isAbilityDisabled ? ["DISABLED" as CardKeyword] : []),
  ].filter((keyword, index, all) => all.indexOf(keyword) === index);
  const fieldFx = size === "board" && runtimeKeywords !== undefined;
  const keywordLabels: Record<string, string> = {
    PROGRAM: "업그레이드",
    ...KEYWORD_RULE_LABELS,
    SILENCE_IMMUNE:"침묵 면역",
    TAUNT: "도발",
    RUSH: "러쉬",
    SURPRISE: "기습",
    DODGE: visibleDodgeCharges > 1 ? `회피(${visibleDodgeCharges})` : "회피",
    ARMOR: typeof armorValue === 'number' ? `아머(${armorValue})` : '아머',
    COUNTDOWN: countdownResolved ? '카운트다운 · 발동 완료' : `카운트다운(${countdownValue})`,
    STUN: "기절",
    SILENCE: "침묵",
    DISABLED: "봉인",
    MULTI_STRIKE: "연타",
  };
  const fitRules = useContext(FittedCardRulesContext);
  const fullRules = (size === "admin" || size === "detail") && rulesOverflow !== "clip";
  const clipRules = size === "detail" && rulesOverflow === "clip";
  const nameClass =
    fitRules && size === "detail" ? "text-[16px] leading-[1.1]" :
    // 필드 카드: 이름을 공격력·체력 보석 위 전체 폭 띠에 두고 기본 크기를 키운다(긴 이름은 자동 축소).
    fieldFx ? "text-[11px] md:text-[13px] leading-none" :
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

  // 반짝이 카드: 손가락·마우스 위치를 따라 빛이 움직인다 (레전드·에픽·챔피언만)
  function foilFollow(event: ReactPointerEvent<HTMLDivElement>) {
    const tilt = size === "hand" && event.pointerType === "mouse";
    // 대전 중에는 반짝이가 마우스를 따라가지 않는다 (아주 약하게 보이는데 비용이 큼). 컬렉션·팩에서는 따라감.
    const foil = (normalizedRarity === "EPIC" || normalizedRarity === "LEGENDARY" || normalizedRarity === "CHAMPION") && !event.currentTarget.closest(".ko-game-shell");
    if (!tilt && !foil) return;
    // 잔렉 방지: 마우스가 움직일 때마다가 아니라 화면이 그려질 때 한 번만 반영하고,
    // 카드 위치는 처음 들어올 때 한 번만 잰다 (기울어진 카드를 계속 다시 재지 않게).
    const node = event.currentTarget;
    let entry = pointerFx.get(node);
    if (!entry) { entry = { rect: node.getBoundingClientRect(), x: 0, y: 0, frame: 0 }; pointerFx.set(node, entry); }
    entry.x = event.clientX; entry.y = event.clientY;
    if (entry.frame) return;
    const live = entry;
    live.frame = requestAnimationFrame(() => {
      live.frame = 0;
      const { rect } = live;
      const fx = (live.x - rect.left) / Math.max(1, rect.width), fy = (live.y - rect.top) / Math.max(1, rect.height);
      // 7. 손패 카드는 마우스를 따라 입체적으로 기운다 (터치는 제외).
      if (tilt) {
        node.style.setProperty("--kj-tilt-x", `${(-(fy - .5) * 14).toFixed(1)}deg`);
        node.style.setProperty("--kj-tilt-y", `${((fx - .5) * 16).toFixed(1)}deg`);
        // 1. 깊이감: 그림이 테두리보다 살짝 반대로 움직여 카드 안쪽이 깊어 보이게
        node.style.setProperty("--kj-par-x", `${((fx - .5) * -7).toFixed(1)}px`);
        node.style.setProperty("--kj-par-y", `${((fy - .5) * -6).toFixed(1)}px`);
        node.dataset.kjTilt = "true";
      }
      if (foil) {
        node.style.setProperty("--foil-dx", (fx - .5).toFixed(3));
        node.style.setProperty("--foil-dy", (fy - .5).toFixed(3));
        node.dataset.foilActive = "true";
      }
    });
  }
  function foilReset(event: ReactPointerEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const entry = pointerFx.get(node);
    if (entry?.frame) cancelAnimationFrame(entry.frame);
    pointerFx.delete(node);
    delete node.dataset.foilActive;
    delete node.dataset.kjTilt;
    node.style.removeProperty("--kj-tilt-x");
    node.style.removeProperty("--kj-tilt-y");
    node.style.removeProperty("--kj-par-x");
    node.style.removeProperty("--kj-par-y");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`ko-card-depth relative aspect-[1060/1484] overflow-visible select-none ${className}`}
      data-rarity={normalizedRarity}
      data-card-type={cardType}
      data-frame-layout={windows?"registered":"default"}
      data-card-definition={cardId}
      data-kfx={fieldFx ? ([...keywordBadges, ...(messenger ? [`MSG_${messenger}`] : [])].join(" ") || " ") : undefined}
      onPointerDownCapture={event=>rememberCardOrigin(event.currentTarget)}
      onPointerMove={foilFollow}
      onPointerLeave={foilReset}
      data-card-highlight={highlight}
      data-card-silenced={isSilenced ? "true" : undefined}
      data-card-stunned={isStunned ? "true" : undefined}
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
      {fieldFx && <KeywordFx keywords={keywordBadges} armor={armorValue} dodge={visibleDodgeCharges} countdown={countdownValue} messenger={messenger} />}
      <div className="absolute inset-0 overflow-visible">
        <CardArtwork
          src={cosmetic.src} fallbackSrc={fallbackImageUrl ?? imageUrl}
          displayOverride={cosmetic.display ?? artworkDisplayOverride}
          loading={artworkLoading}
          alt={name || "카드 이미지"}
          className={`ko-card-art-depth absolute inset-0 h-full w-full ${isSilenced ? "ko-card-artwork-muted" : ""}`}
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
            onLoad={e=>{if(e.currentTarget.currentSrc&&e.currentTarget.currentSrc!==new URL(frameUrl,document.baseURI).href)return;if(frameSettings?.frameUrl&&!frameFailed){const windows=frameWindowsFromImage(e.currentTarget);if(windows)setDetectedFrame({src:frameUrl,windows});}}}
            alt=""
            aria-hidden="true"
            className="ko-card-frame pointer-events-none absolute inset-0 z-10 h-full w-full"
            style={{
              transform: `translate(${frameOffsetX}%, ${frameOffsetY}%) scale(${frameScale})`,
              clipPath:cutout,
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
        {(normalizedRarity === "EPIC" || normalizedRarity === "LEGENDARY" || normalizedRarity === "CHAMPION") && (
          <div className="ko-card-foil" data-foil={normalizedRarity} data-foil-size={size} aria-hidden="true" />
        )}

        {showName && (
          <div data-card-name
            className="pointer-events-none absolute z-20 flex items-center justify-center overflow-hidden px-[2%] text-center"
            style={{
              left: `${scalePercent(frameLayout.name.left, frameScale, frameOffsetX)}%`,
              right: `${scaleInset(frameLayout.name.right, frameScale, frameOffsetX)}%`,
              top: `${scalePercent(frameLayout.name.top, frameScale, frameOffsetY)}%`,
              height: `${scaleSize(frameLayout.name.height, frameScale)}%`,
              color: !frameSettings?.frameUrl && layoutRarity === "LEGENDARY" ? "#21180a" : "#ffffff",
            }}
          >
            <FittedCardName text={name || "카드 이름"} className={`font-black leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${nameClass}`}/>
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
            <span data-card-stat="cost"><MotionNumber className={statClass} value={cost} /></span>
          </div>
        )}

        {showRules && (
          <div data-card-rules
            className={`absolute z-20 flex justify-center px-[5%] text-center text-neutral-100 ${fullRules ? "pointer-events-auto items-start overflow-y-auto" : "pointer-events-none items-center overflow-hidden"} ${fitRules ? "py-0" : "py-[1%]"}`}
            onPointerDown={fullRules ? e=>e.stopPropagation() : undefined}
            onClick={fullRules ? e=>e.stopPropagation() : undefined}
            style={{
              left: `${scalePercent(frameLayout.rules.left, frameScale, frameOffsetX)}%`,
              right: `${scaleInset(frameLayout.rules.right, frameScale, frameOffsetX)}%`,
              top: `${scalePercent(frameLayout.rules.top, frameScale, frameOffsetY)}%`,
              bottom: `${scaleInset(frameLayout.rules.bottom, frameScale, frameOffsetY)}%`,
              color: !frameSettings?.frameUrl && layoutRarity === "LEGENDARY" ? "#21180a" : undefined,
            }}
          >
            {fitRules ? <FittedCardRules
              text={displayRulesText || "효과 없음"} fitFull={fullRules} fitThenClip={clipRules} interactive={size !== "board" && highlight !== "target"}
              className={`w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${size === "detail" ? "text-[16px]" : size === "admin" ? "text-[10px]" : "text-[8px]"} leading-tight`}
            /> : <span className={`line-clamp-6 w-full font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${rulesClass}`}>
              <CardRulesText text={displayRulesText || "효과 없음"} interactive={size !== "board" && highlight !== "target"}/>
            </span>}
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
            <span data-card-stat="attack"><MotionNumber className={`${statClass} text-amber-300`} value={attack} /></span>
            </div>
            <div
              className="pointer-events-none absolute z-20 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
              style={{
                left: `${scalePercent(frameLayout.health.centerX, frameScale, frameOffsetX)}%`,
                top: `${scalePercent(frameLayout.health.centerY, frameScale, frameOffsetY)}%`,
                width: `${scaleSize(frameLayout.health.size, frameScale)}%`,
              }}
            >
              <span data-card-stat="health"><MotionNumber className={`${statClass} text-red-400`} value={health} /></span>
            </div>
          </>
        )}

        <div className="pointer-events-none absolute right-[5%] top-[15%] z-30 flex max-w-[52%] flex-col items-end gap-1">
          <span className={`ko-card-rarity max-w-full break-all rounded px-1 text-[8px] font-black leading-tight ${rarityBadgeColors[normalizedRarity]}`}>
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
                data-kw={keyword}
                data-testid={keyword === "SILENCE_IMMUNE" ? "card-silence-immunity-badge" : undefined}
                 className={`max-w-full rounded border px-0.5 py-0.5 text-[clamp(0.45rem,0.7vw,0.65rem)] font-extrabold leading-none shadow-lg ${keyword === "SILENCE_IMMUNE" ? "ko-card-silence-immunity-badge" : ""} ${
                  keyword === "SILENCE_IMMUNE" ? "border-amber-200 bg-neutral-950/95 text-amber-100" :
                  keyword === "TAUNT" ? "border-cyan-200 bg-cyan-950/90 text-cyan-100" :
                  keyword === "RUSH" ? "border-amber-200 bg-amber-950/90 text-amber-100" :
                  keyword === "SURPRISE" ? "border-fuchsia-200 bg-fuchsia-950/90 text-fuchsia-100" :
                  keyword === "DODGE" ? "border-violet-200 bg-violet-950/90 text-violet-100" :
                  String(keyword) === "STUN" ? "border-orange-200 bg-orange-950/90 text-orange-100" :
                  String(keyword) === "SILENCE" ? "border-purple-200 bg-purple-950/90 text-purple-100" :
                  String(keyword) === "DISABLED" ? "border-slate-200 bg-slate-950/90 text-slate-100" :
                  "border-red-200 bg-red-950/90 text-red-100"
                }`}
                title={keyword === "SILENCE_IMMUNE" ? SILENCE_IMMUNITY_DESCRIPTION : keywordLabels[keyword] ?? keyword}
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

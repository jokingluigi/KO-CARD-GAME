import { fetchCosmetics } from "@/lib/cosmetics-client";
import { createPortal } from "react-dom";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type RefObject,
  type CSSProperties,
} from "react";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
  type CosmeticLoadout,
  type CosmeticItem,
  type CosmeticAssets,
  type ImageEmoteEvent,
} from "@workspace/cosmetics";
import "./cosmetics.css";
import { prefersReducedMotion } from "./presentation-config";
export const BattleCosmeticsContext = createContext<MatchCosmetics>({});
/** Current controller owns presentation, determined by canonical player ID, never screen position. */
export function useCosmeticImage(
  ownerId: string | undefined,
  id: string | undefined,
  type: "CARD_SKIN" | "CHAMPION_SKIN",
  original: string | null | undefined,
  context: keyof CosmeticAssets = "art",
) {
  const loadouts = useContext(BattleCosmeticsContext);
  return {
    display:
      id && ownerId
        ? cosmeticImageSettings(loadouts[ownerId], type, id, context)
        : undefined,
    src:
      id && ownerId
        ? cosmeticImage(loadouts[ownerId], type, id, context, original)
        : original,
  };
}
export function CosmeticBack({ loadout }: { loadout?: CosmeticLoadout }) {
  const src = loadout?.cardBack?.imageAssets?.art;
  const [failed, setFailed] = useState<string | null>(null);
  return src && src !== failed ? (
    <img
      src={src}
      alt="장착 카드 뒷면"
      className="cosmetic-card-back"
      onError={() => setFailed(src)}
    />
  ) : null;
}
/** A bubble anchored to the speaking champion; its lifetime follows the event clock. */
export function CosmeticEmoteOverlay({
  event,
  playerId,
  hide = false,
  anchor,
  self = false,
}: {
  event?: ImageEmoteEvent;
  playerId: string;
  hide?: boolean;
  anchor: RefObject<HTMLElement | null>;
  self?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!event) return;
    const timer = setTimeout(
      () => setNow(event.expiresAt),
      Math.max(0, event.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [event]);
  if (hide || !event || event.playerId !== playerId || event.expiresAt <= now)
    return null;
  return (
    <ChampionEmoteBubble
      key={event.matchId + ":" + event.requestId}
      event={event}
      anchor={anchor}
      self={self}
    />
  );
}
function ChampionEmoteBubble({
  event,
  anchor,
  self,
}: {
  event: ImageEmoteEvent;
  anchor: RefObject<HTMLElement | null>;
  self: boolean;
}) {
  const [layout, setLayout] = useState<{
      left: number;
      top: number;
      size: number;
      tail: string;
    } | null>(null),
    [ready, setReady] = useState<number | null>(null),
    [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const size = innerWidth < 600 ? 104 : 124;
      const left = Math.max(
        8,
        Math.min(
          innerWidth - size - 8,
          self ? rect.right + 8 : rect.left - size - 8,
        ),
      );
      const top = Math.max(
        8,
        Math.min(
          innerHeight - size - 8,
          rect.top + Math.min(rect.height * 0.16, 26),
        ),
      );
      const tail =
        rect.left + rect.width / 2 < left + size / 2 ? "left" : "right";
      setLayout((old) =>
        old &&
        old.left === left &&
        old.top === top &&
        old.size === size &&
        old.tail === tail
          ? old
          : { left, top, size, tail },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, self]);
  if (failed) return null;
  return createPortal(
    <div
      className="cosmetic-emote-overlay cosmetic-emote-bubble"
      data-cosmetic-emote-player={event.playerId}
      data-tail={layout?.tail}
      data-ready={ready !== null}
      data-reduced-motion={prefersReducedMotion()}
      style={
        {
          position: "fixed",
          left: layout?.left ?? 0,
          top: layout?.top ?? 0,
          right: "auto",
          width: layout?.size ?? 104,
          height: layout?.size ?? 104,
          visibility: layout ? "visible" : "hidden",
          "--emote-lifetime": `${ready ?? 2000}ms`,
        } as CSSProperties
      }
      aria-live="polite"
      aria-label={`${self ? "내" : "상대"} 챔피언의 이모티콘`}
    >
      <img
        src={event.imageUrl}
        alt={event.name}
        className="cosmetic-emote-image"
        onLoad={() => setReady(Math.max(1, event.expiresAt - Date.now()))}
        onError={() => setFailed(true)}
      />
    </div>,
    document.body,
  );
}
export function CosmeticEmoteTools({
  onSend,
  hide,
  onHide,
}: {
  onSend?: (item: CosmeticItem) => void;
  hide: boolean;
  onHide: (hide: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<CosmeticItem[]>([]),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0),
    [query, setQuery] = useState("");
  const [, refreshLayout] = useState(0);
  const button = useRef<HTMLButtonElement | null>(null),
    panel = useRef<HTMLDivElement | null>(null);
  const rect = button.current?.getBoundingClientRect();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    setQuery("");
    fetchCosmetics({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data.owned))
          throw Error("보유 이모티콘을 확인하지 못했어요.");
        setItems(
          data.owned
            .map((row) => row.item)
            .filter(
              (item) =>
                item.type === "IMAGE_EMOTE" &&
                item.isActive &&
                item.imageAssets?.art,
            ),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "보유 이모티콘을 불러오지 못했어요.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!panel.current?.contains(node) && !button.current?.contains(node))
        setOpen(false);
    };
    const resize = () => refreshLayout((x) => x + 1);
    window.addEventListener("resize", resize);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      controller.abort();
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, retry]);
  return (
    <span className="cosmetic-emote-tools">
      <button
        type="button"
        ref={button}
        aria-label="이미지 이모티콘"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ☺
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="보유 이모티콘"
            className="cosmetic-emote-picker cosmetic-emote-picker--owned"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                button.current?.focus();
              }
            }}
            style={{
              position: "fixed",
              zIndex: 240,
              left: Math.max(
                8,
                Math.min(
                  innerWidth - Math.min(320, innerWidth - 16) - 8,
                  rect?.left ?? 8,
                ),
              ),
              right: "auto",
              bottom: "auto",
              top: Math.max(
                8,
                Math.min(
                  innerHeight - Math.min(420, innerHeight - 16),
                  rect?.bottom ?? 8,
                ),
              ),
            }}
          >
            <strong className="text-sm text-amber-200">보유 이모티콘</strong>
            {loading ? (
              <p role="status">목록을 불러오고 있어요…</p>
            ) : error ? (
              <div role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="cosmetic-emote-wide"
                  onClick={() => setRetry((x) => x + 1)}
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <>
                {items.length > 8 && (
                  <input
                    aria-label="보유 이모티콘 검색"
                    placeholder="이름 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
                <div className="cosmetic-owned-emotes">
                  {items
                    .filter((item) => item.name.includes(query))
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-label={item.name}
                        disabled={!onSend}
                        onClick={() => {
                          onSend?.(item);
                          setOpen(false);
                        }}
                      >
                        <img src={item.imageAssets.art} alt="" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                </div>
                {!items.length && (
                  <p className="text-xs text-white">
                    사용 가능한 이모티콘이 없어요.
                  </p>
                )}
                {items.length > 0 &&
                  !items.some((item) => item.name.includes(query)) && (
                    <p>검색 결과가 없어요.</p>
                  )}
              </>
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={hide}
                onChange={(e) => onHide(e.target.checked)}
              />
              상대 이미지 숨기기
            </label>
            <button
              type="button"
              className="cosmetic-emote-wide"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              닫기
            </button>
          </div>,
          document.body,
        )}
    </span>
  );
}
export function useHideCosmeticEmotes() {
  const [hide, setHide] = useState(() => {
    try {
      return localStorage.getItem("ko-hide-image-emotes") === "true";
    } catch {
      return false;
    }
  });
  return [
    hide,
    (value: boolean) => {
      setHide(value);
      try {
        localStorage.setItem("ko-hide-image-emotes", String(value));
      } catch {}
    },
  ] as const;
}

import { createPortal } from "react-dom";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type RefObject,
} from "react";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
  type CosmeticLoadout,
  type CosmeticAssets,
  type ImageEmoteEvent,
} from "@workspace/cosmetics";
import "./cosmetics.css";
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
    display: id && ownerId ? cosmeticImageSettings(loadouts[ownerId],type,id,context) : undefined,
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
export function CosmeticEmoteOverlay({
  event,
  playerId,
  hide = false,
  anchor,
}: {
  event?: ImageEmoteEvent;
  playerId: string;
  hide?: boolean;
  anchor: RefObject<HTMLElement | null>;
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
  const rect = anchor.current?.getBoundingClientRect();
  if (!rect) return null;
  return createPortal(
    <div
      className="cosmetic-emote-overlay"
      data-cosmetic-emote-player={playerId}
      style={{
        position: "fixed",
        left: Math.max(4, Math.min(window.innerWidth - 92, rect.right + 4)),
        top: Math.max(4, rect.top),
        right: "auto",
      }}
      aria-live="polite"
    >
      <img
        key={event.requestId}
        src={event.imageUrl}
        alt={event.name}
        className="cosmetic-emote-image"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
    </div>,
    document.body,
  );
}
export function CosmeticEmoteTools({
  loadout,
  onSend,
  hide,
  onHide,
}: {
  loadout?: CosmeticLoadout;
  onSend?: (slot: number) => void;
  hide: boolean;
  onHide: (hide: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const rect = button.current?.getBoundingClientRect();
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
            className="cosmetic-emote-picker"
            style={{
              position: "fixed",
              zIndex: 240,
              left: Math.max(8, Math.min(innerWidth - 180, rect?.left ?? 8)),
              right: "auto",
              bottom: "auto",
              top: Math.max(8, Math.min(innerHeight - 245, rect?.bottom ?? 8)),
            }}
          >
            {loadout?.emotes?.map((item, i) =>
              item ? (
                <button
                  type="button"
                  key={i}
                  aria-label={item.name}
                  disabled={!onSend}
                  onClick={() => {
                    onSend?.(i + 1);
                    setOpen(false);
                  }}
                >
                  <img src={item.imageAssets.art} alt={item.name} />
                </button>
              ) : null,
            )}
            {!loadout?.emotes?.some(Boolean) && (
              <span className="col-span-2 text-xs text-white">
                장착한 이모티콘 없음
              </span>
            )}
            <label>
              <input
                type="checkbox"
                checked={hide}
                onChange={(e) => onHide(e.target.checked)}
              />{" "}
              상대 이미지 숨기기
            </label>
            <button
              type="button"
              className="col-span-2 !w-full"
              onClick={() => setOpen(false)}
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

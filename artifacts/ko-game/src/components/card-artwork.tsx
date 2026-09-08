import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  normalizeImageDisplaySettings,
  type ImageDisplaySettings,
} from "../game/cards/types";

export function CardArtwork({
  src,
  alt,
  className = "",
  imageDisplayMode,
  imageScale,
  imagePositionX,
  imagePositionY,
  interactive = false,
  onPositionChange,
  showHint = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  imageDisplayMode?: ImageDisplaySettings["imageDisplayMode"];
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  interactive?: boolean;
  onPositionChange?: (position: Pick<ImageDisplaySettings, "imagePositionX" | "imagePositionY">) => void;
  showHint?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPositionX: number;
    startPositionY: number;
  } | null>(null);
  const settings = normalizeImageDisplaySettings({
    imageDisplayMode,
    imageScale,
    imagePositionX,
    imagePositionY,
  });

  useEffect(() => setFailed(false), [src]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || !onPositionChange || !src) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositionX: settings.imagePositionX,
      startPositionY: settings.imagePositionY,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onPositionChange) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPositionX = Math.min(
      100,
      Math.max(0, drag.startPositionX + ((event.clientX - drag.startClientX) / rect.width) * 100),
    );
    const nextPositionY = Math.min(
      100,
      Math.max(0, drag.startPositionY + ((event.clientY - drag.startClientY) / rect.height) * 100),
    );
    onPositionChange({ imagePositionX: nextPositionX, imagePositionY: nextPositionY });
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  const imageStyle = {
    objectFit: settings.imageDisplayMode === "CONTAIN" ? "contain" : "cover",
    objectPosition: `${settings.imagePositionX}% ${settings.imagePositionY}%`,
    transform: `scale(${settings.imageScale})`,
    transformOrigin: `${settings.imagePositionX}% ${settings.imagePositionY}%`,
  } as const;

  if (!src || failed) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-neutral-950 ${className}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={interactive ? { touchAction: "none" } : undefined}
      >
        <span className="-rotate-12 font-display text-[10px] tracking-wider text-neutral-600">
          이미지 없음
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${interactive ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={interactive ? { touchAction: "none" } : undefined}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
        style={imageStyle}
        onDragStart={(event) => event.preventDefault()}
        onError={() => setFailed(true)}
      />
      {showHint && (
        <span className="pointer-events-none absolute inset-x-2 bottom-2 z-10 rounded bg-black/65 px-2 py-1 text-center text-[10px] font-bold text-white">
          드래그해서 이미지 위치 조절
        </span>
      )}
    </div>
  );
}
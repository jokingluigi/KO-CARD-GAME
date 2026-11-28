import { useState } from "react";
/**
 * Uses the registered product art. A portrait upload is treated as a finished pack render and shown as is;
 * a landscape (banner) upload is placed inside the same pack silhouette as the missing-art fallback, with the
 * pack name printed on it, so every product shares one display shape and packs with the same art stay distinct.
 */
export function PackCover({
  src,
  name,
  compact = false,
}: {
  src?: string | null;
  name: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [shape, setShape] = useState<{ src: string; landscape: boolean } | null>(null);
  const hasArt = Boolean(src && src !== failed);
  const landscape = hasArt && shape && shape.src === src ? shape.landscape : null;
  return (
    <div className={`ko-pack-cover ${compact ? "is-compact" : ""}`}>
      {hasArt && landscape !== true ? (
        <img
          src={src!}
          alt={name}
          // Hidden until the shape is known, so a banner never flashes outside the pack frame.
          style={landscape === null ? { visibility: "hidden" } : undefined}
          onLoad={(event) => {
            const image = event.currentTarget;
            setShape({ src: src!, landscape: image.naturalWidth > image.naturalHeight * 1.1 });
          }}
          onError={() => setFailed(src!)}
        />
      ) : hasArt ? (
        <div className="ko-pack-sleeve has-art" role="img" aria-label={`${name} 팩`}>
          <img className="ko-pack-sleeve__art" src={src!} alt="" onError={() => setFailed(src!)} />
          <span className="ko-pack-sleeve__brand">KO CARD PACK</span>
          <small className="ko-pack-sleeve__name">{name}</small>
        </div>
      ) : (
        <div
          className="ko-pack-sleeve"
          aria-label={`${name} 팩 이미지 대체 표시`}
        >
          <span>KO CARD BATTLE</span>
          <strong>KO</strong>
          <span>CARD PACK</span>
          <i aria-hidden="true" />
          <small>{name}</small>
        </div>
      )}
    </div>
  );
}

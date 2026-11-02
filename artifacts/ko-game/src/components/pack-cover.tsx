import { useState } from "react";
/** Uses the registered product art; the brand sleeve is only a missing-art fallback. */
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
  return (
    <div className={`ko-pack-cover ${compact ? "is-compact" : ""}`}>
      {src && src !== failed ? (
        <img src={src} alt={name} onError={() => setFailed(src)} />
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

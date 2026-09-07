import { useEffect, useState } from "react";

export function CardArtwork({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-neutral-950 ${className}`}>
        <span className="-rotate-12 font-display text-[10px] tracking-wider text-neutral-600">
          이미지 없음
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
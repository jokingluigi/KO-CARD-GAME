import { useState, type CSSProperties } from "react";
type Props = {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
};
/** The original registered URL is retried without altering signed asset URLs. */
export function RecoverableArtwork(props: Props) {
  return (
    <ArtworkRequest
      key={JSON.stringify([props.src, props.fallbackSrc])}
      {...props}
    />
  );
}
function ArtworkRequest({ src, fallbackSrc, alt, className, style }: Props) {
  const [fallback, setFallback] = useState(false),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <div
        role="status"
        className="my-3 grid min-h-24 place-content-center gap-3 rounded border border-neutral-700 bg-neutral-950 p-4 text-center text-sm text-neutral-300"
      >
        <p>{alt} 이미지를 불러오지 못했어요.</p>
        <button
          type="button"
          className="min-h-11 rounded border border-amber-700 px-4 py-2 text-amber-200"
          onClick={() => {
            setFallback(false);
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          이미지 다시 불러오기
        </button>
      </div>
    );
  return (
    <img
      key={`${fallback}:${attempt}`}
      src={fallback ? fallbackSrc! : src}
      alt={alt}
      className={className}
      style={style}
      decoding="async"
      onError={() => {
        if (!fallback && fallbackSrc && fallbackSrc !== src) setFallback(true);
        else setFailed(true);
      }}
    />
  );
}

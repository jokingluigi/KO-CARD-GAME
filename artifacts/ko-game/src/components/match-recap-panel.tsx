import { CardArtwork } from "./card-artwork";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
} from "@workspace/cosmetics";
import type { MatchHighlight, MatchRecap } from "@workspace/game-engine";
export function MatchRecapPanel({
  recap,
  viewerId,
  variant = "default",
  cosmetics,
}: {
  recap: MatchRecap;
  viewerId: string;
  variant?: "default" | "result";
  cosmetics?: MatchCosmetics;
}) {
  const side = (id: string | null) =>
    id === viewerId ? "나" : id ? "상대" : "";
  const text = (h: MatchHighlight) =>
    h.kind === "FINISHER"
      ? `결정타 · ${side(h.playerId)}의 ${h.sourceName} · ${h.amount} 피해`
      : h.kind === "QUEST"
        ? `${side(h.playerId)}의 ${h.sourceName} · 챔피언 퀘스트 완료`
        : h.kind === "BIG_HIT"
          ? `큰 한 방 · ${side(h.playerId)}의 ${h.sourceName} · ${h.amount} 피해`
          : h.kind === "FATIGUE"
            ? "덱 소진으로 경기 종료"
            : `${side(h.playerId)}의 항복으로 경기 종료`;
  return (
    <div
      className={
        variant === "result"
          ? "ko-result-recap"
          : "mt-5 min-w-0 space-y-4 text-left"
      }
    >
      <section
        aria-label="경기 MVP"
        className={
          variant === "result"
            ? "ko-result-mvp"
            : "rounded-xl border border-amber-300/30 bg-black/35 p-4"
        }
      >
        <h2 className="text-sm font-black text-amber-200">경기 MVP</h2>
        {recap.mvp ? (
          <div className="mt-3 flex min-w-0 gap-3">
            {recap.mvp.imageUrl &&
              (variant === "result" ? (
                <CardArtwork
                  src={cosmeticImage(
                    cosmetics?.[recap.mvp.playerId],
                    "CARD_SKIN",
                    recap.mvp.definitionId,
                    "art",
                    recap.mvp.imageUrl,
                  )}
                  fallbackSrc={recap.mvp.imageUrl}
                  displayOverride={cosmeticImageSettings(
                    cosmetics?.[recap.mvp.playerId],
                    "CARD_SKIN",
                    recap.mvp.definitionId,
                    "art",
                  )}
                  alt={recap.mvp.name}
                  imageDisplayMode="CONTAIN"
                  className="ko-result-mvp-art"
                />
              ) : (
                <img
                  src={recap.mvp.imageUrl}
                  alt=""
                  className="h-20 w-16 shrink-0 rounded object-cover"
                />
              ))}
            <div className="min-w-0">
              <p className="break-words text-lg font-black">{recap.mvp.name}</p>
              <p className="mt-1 text-xs text-neutral-300">
                {side(recap.mvp.playerId)}의 선수 · 피해 {recap.mvp.damage} ·
                처치 {recap.mvp.kills}
              </p>
              <p className="mt-1 text-xs font-bold text-amber-200">
                기여도 {recap.mvp.score}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-300">
            MVP를 선정할 선수 기록이 없습니다.
          </p>
        )}
        <details className="mt-3 text-xs text-neutral-400">
          <summary className="cursor-pointer">선정 기준</summary>
          <p className="mt-2 leading-5">
            공개된 선수가 준 상대 피해량 + 상대 선수 처치 × 5. 동점이면 피해량,
            처치 수, 먼저 기여한 순서로 선정합니다. 변신·부활은 같은 선수 개체의
            기록으로 집계됩니다.
          </p>
        </details>
      </section>
      {variant === "result" ? (
        <details aria-label="경기 하이라이트" className="ko-result-highlights">
          <summary className="min-h-11 cursor-pointer text-sm font-black text-amber-200">
            경기 하이라이트 <span aria-hidden="true">↗</span>
          </summary>
          {recap.highlights.length ? (
            <ol className="mt-3 space-y-3">
              {recap.highlights.map((h) => (
                <li key={h.eventIndex} className="flex min-w-0 gap-3 text-sm">
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {h.turn}턴
                  </span>
                  <span className="min-w-0 break-words">{text(h)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-neutral-300">
              기록된 주요 장면이 없습니다.
            </p>
          )}
        </details>
      ) : (
        <section
          aria-label="경기 하이라이트"
          className="rounded-xl border border-white/15 bg-black/35 p-4"
        >
          <h2 className="text-sm font-black text-amber-200">경기 하이라이트</h2>
          {recap.highlights.length ? (
            <ol className="mt-3 space-y-3">
              {recap.highlights.map((h) => (
                <li key={h.eventIndex} className="flex min-w-0 gap-3 text-sm">
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {h.turn}턴
                  </span>
                  <span className="min-w-0 break-words">{text(h)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-neutral-300">
              기록된 주요 장면이 없습니다.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

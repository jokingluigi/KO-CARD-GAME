import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchDecks, type Deck } from "@/lib/decks-client";
import { resolveLaunchDeck, launchDeckEditor } from "@/lib/launch-deck";
import { optionalCosmetics } from "@/lib/cosmetics-client";
import {
  cosmeticImage,
  cosmeticImageSettings,
  emptyCosmetics,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
import { CardArtwork } from "./card-artwork";
/** The banner derives its champion from the same account-selected deck as match entry. */
export function LaunchDeckBanner({ accountId }: { accountId?: string }) {
  const [, navigate] = useLocation(),
    [decks, setDecks] = useState<Deck[] | null>(null),
    [loadout, setLoadout] = useState<CosmeticLoadout>(emptyCosmetics),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      generation = 0;
    setDecks(null);
    setError(null);
    setLoadout(emptyCosmetics());
    const load = () => {
      const request = ++generation;
      void fetchDecks()
        .then((d) => {
          if (active && request === generation) {
            setDecks(d);
            setError(null);
          }
        })
        .catch((e) => {
          if (active && request === generation)
            setError(
              e instanceof Error ? e.message : "출전 덱을 불러오지 못했어요.",
            );
        });
      void optionalCosmetics().then((x) => {
        if (active && request === generation) setLoadout(x);
      });
    };
    load();
    const visible = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accountId, retry]);
  const selected = decks ? resolveLaunchDeck(decks) : null,
    deck = selected?.deck,
    champion = deck?.champion;
  const src = champion
    ? cosmeticImage(
        loadout,
        "CHAMPION_SKIN",
        champion.id,
        "art",
        champion.imageUrl,
      )
    : null;
  return (
    <aside
      className="ko-launch-banner"
      aria-label="현재 출전 덱"
      data-testid="launch-deck-banner"
    >
      <div className="ko-launch-banner__art">
        {champion ? (
          <CardArtwork
            src={src}
            fallbackSrc={champion.imageUrl}
            alt={champion.name}
            className="h-full w-full"
            {...champion}
            displayOverride={cosmeticImageSettings(
              loadout,
              "CHAMPION_SKIN",
              champion.id,
              "art",
            )}
          />
        ) : (
          <span className="font-display text-amber-200">KO</span>
        )}
      </div>
      <div className="ko-launch-banner__copy">
        <p className="text-xs text-amber-200">현재 출전 덱</p>
        <h2>
          {champion?.name ??
            (decks
              ? "출전 덱을 지정하세요"
              : error
                ? "출전 덱 확인 실패"
                : "출전 덱 확인 중…")}
        </h2>
        <p className="ko-launch-banner__deck">{deck?.name ?? ""}</p>
        {(error || selected?.reason) && (
          <p role="status" className="text-xs text-amber-100">
            {error ?? selected?.reason}
          </p>
        )}
        <button
          type="button"
          onClick={() =>
            error
              ? setRetry((x) => x + 1)
              : navigate(launchDeckEditor(deck?.id))
          }
        >
          {error ? "다시 확인" : "덱 변경"}
        </button>
      </div>
    </aside>
  );
}

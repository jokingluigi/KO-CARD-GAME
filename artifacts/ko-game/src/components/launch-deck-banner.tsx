import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { fetchDecks, selectDeck, type Deck } from "@/lib/decks-client";
import { resolveLaunchDeck, launchDeckEditor } from "@/lib/launch-deck";
import { optionalCosmetics } from "@/lib/cosmetics-client";
import {
  cosmeticImage,
  cosmeticImageSettings,
  emptyCosmetics,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
import { CardArtwork } from "./card-artwork";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { homeDeckSummary } from "./home-deck-policy";
export type HomeLaunchStatus = {
  kind: "LOADING" | "READY" | "MISSING" | "INVALID" | "ERROR";
  reason: string;
  editUrl: string;
};
type Poster = {
  deck: Deck;
  src: string | null;
  settings: ReturnType<typeof cosmeticImageSettings>;
};
export function LaunchDeckBanner({
  accountId,
  onStatusChange,
}: {
  accountId?: string;
  onStatusChange?: (s: HomeLaunchStatus) => void;
}) {
  const [, navigate] = useLocation(),
    [decks, setDecks] = useState<Deck[] | null>(null),
    [loadout, setLoadout] = useState<CosmeticLoadout>(emptyCosmetics),
    [appearanceReady, setAppearanceReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false),
    [selectionError, setSelectionError] = useState(""),
    [poster, setPoster] = useState<Poster | null>(null),
    [preparing, setPreparing] = useState(false);
  const generation = useRef(0),
    busy = useRef(false),
    mounted = useRef(true),
    selectController = useRef<AbortController | null>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selectController.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setDecks(null);
    setError(null);
    const load = () => {
      if (busy.current) return;
      const revision = ++generation.current;
      void fetchDecks()
        .then((d) => {
          if (!Array.isArray(d))
            throw Error(
              "덱 목록 응답을 확인하지 못했어요. 다시 확인해 주세요.",
            );
          if (active && revision === generation.current) {
            setDecks(d);
            setError(null);
          }
        })
        .catch((e) => {
          if (active && revision === generation.current)
            setError(
              e instanceof Error ? e.message : "출전 덱을 불러오지 못했어요.",
            );
        });
      void optionalCosmetics().then((c) => {
        if (active && revision === generation.current) {
          setLoadout(c);
          setAppearanceReady(true);
        }
      });
    };
    load();
    const visible = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("ko-launch-deck-changed", load);
    return () => {
      active = false;
      generation.current++;
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("ko-launch-deck-changed", load);
    };
  }, [accountId, retry]);
  useEffect(() => {
    setPoster(null);
    setLoadout(emptyCosmetics());
    setAppearanceReady(false);
    setOpen(false);
    setSelectionError("");
  }, [accountId]);
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
  const settings = champion
    ? cosmeticImageSettings(loadout, "CHAMPION_SKIN", champion.id, "art")
    : undefined;
  // The title and illustration commit together. Slow replacement art never empties an existing poster.
  useEffect(() => {
    if (!deck || !champion) {
      if (decks) setPoster(null);
      setPreparing(false);
      return;
    }
    if (!appearanceReady) {
      setPreparing(true);
      return;
    }
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const image = new Image();
    setPreparing(true);
    const commit = (url: string | null) => {
      if (!active) return;
      clearTimeout(timer);
      setPoster({ deck, src: url, settings });
      setPreparing(false);
    };
    const primary = src ?? champion.imageUrl;
    let fallback = false;
    const attempt = (url: string | null) => {
      if (!url) {
        commit(null);
        return;
      }
      image.onload = () => commit(url);
      image.onerror = () => {
        if (!fallback && champion.imageUrl && url !== champion.imageUrl) {
          fallback = true;
          attempt(champion.imageUrl);
        } else commit(null);
      };
      image.src = url;
      if (image.complete && image.naturalWidth) commit(url);
    };
    timer = setTimeout(() => commit(null), 5000);
    attempt(primary);
    return () => {
      active = false;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
  }, [
    deck,
    champion,
    src,
    JSON.stringify(settings),
    decks === null,
    appearanceReady,
  ]);
  const kind: HomeLaunchStatus["kind"] = error
    ? "ERROR"
    : !decks || saving
      ? "LOADING"
      : !deck
        ? "MISSING"
        : selected?.reason || !champion
          ? "INVALID"
          : "READY";
  const reason =
    error ??
    (kind === "LOADING"
      ? "출전 덱을 확인하고 있어요."
      : (selected?.reason ??
        (kind === "INVALID" ? "챔피언을 지정해 주세요." : "출전 준비 완료")));
  useEffect(() => {
    onStatusChange?.({ kind, reason, editUrl: launchDeckEditor(deck?.id) });
  }, [kind, reason, deck?.id, onStatusChange]);
  async function choose(candidate: Deck) {
    if (busy.current || !candidate.isValid) return;
    busy.current = true;
    setSaving(true);
    setSelectionError("");
    generation.current++;
    const controller = new AbortController();
    selectController.current = controller;
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await selectDeck(candidate.id, {
        signal: controller.signal,
      });
      if (!result.deck || !result.deck.isSelected)
        throw Error("출전 덱 선택 결과를 확인하지 못했습니다.");
      if (mounted.current) {
        setDecks((current) =>
          (current ?? []).map((d) =>
            d.id === result.deck!.id
              ? result.deck!
              : { ...d, isSelected: false },
          ),
        );
        setError(null);
        setOpen(false);
        void optionalCosmetics().then((c) => {
          if (mounted.current) {
            setLoadout(c);
            setAppearanceReady(true);
          }
        });
      }
    } catch (e) {
      if (mounted.current) {
        setSelectionError(
          controller.signal.aborted
            ? "응답이 늦어 선택 결과를 다시 확인하고 있어요. 현재 출전 덱을 확인해 주세요."
            : e instanceof Error
              ? e.message
              : "덱 선택 실패",
        );
        setRetry((x) => x + 1);
      }
    } finally {
      clearTimeout(timer);
      busy.current = false;
      selectController.current = null;
      if (mounted.current) setSaving(false);
    }
  }
  const options =
    decks?.filter((d) =>
      (d.name + " " + d.champion?.name)
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ) ?? [];
  const shown = poster?.deck,
    missing = kind === "MISSING",
    needsBuild = !decks?.some((d) => d.isValid),
    failedArt = Boolean(champion && poster && !poster.src);
  return (
    <>
      <aside
        className={`ko-launch-banner ${!poster?.src ? "ko-launch-banner--empty" : ""}`}
        aria-label="현재 출전 덱"
        data-testid="launch-deck-banner"
        data-launch-state={kind}
        aria-busy={saving}
      >
        <div
          className="ko-launch-banner__art"
          data-ui-motion-state={`REPLACE:${accountId}:${shown?.id ?? "none"}:${poster?.src ?? "none"}`}
        >
          {poster?.src && shown?.champion ? (
            <CardArtwork
              src={poster.src}
              alt={shown.champion.name}
              className="h-full w-full"
              {...shown.champion}
              displayOverride={poster.settings}
            />
          ) : (
            <span className="ko-home-art-fallback">
              {shown?.champion?.name ?? "KO"}
            </span>
          )}
        </div>
        <div className="ko-launch-banner__copy">
          <p className="text-xs text-amber-200">
            {kind === "READY"
              ? "현재 출전 중"
              : kind === "INVALID"
                ? "덱 확인 필요"
                : "현재 출전 덱"}
          </p>
          <h2 title={shown?.name}>
            {shown?.name ??
              (missing
                ? "출전 덱을 지정하세요"
                : kind === "ERROR"
                  ? "출전 덱 확인 실패"
                  : deck && champion
                    ? "챔피언 그림 준비 중…"
                    : "출전 덱 확인 중…")}
          </h2>
          {shown?.champion && (
            <p className="ko-launch-banner__deck">{shown.champion.name}</p>
          )}
          {shown && (
            <DeckComposition deck={shown} className="ko-home-deck-summary" />
          )}
          <p
            id="home-launch-status"
            role="status"
            className="ko-home-launch-status"
          >
            {preparing && poster
              ? "새 출전 덱 그림 준비 중…"
              : failedArt
                ? "그림을 불러오지 못했어요. 출전 덱은 정상 선택되어 있어요."
                : missing
                  ? "덱을 지정하면 바로 출전할 수 있어요."
                  : reason}
          </p>
          {missing && (
            <ol className="ko-home-start-guide" aria-label="대전 시작 안내">
              <>
                {needsBuild && (
                  <li data-current>
                    {decks?.length ? "1 덱 완성" : "1 덱 만들기"}
                  </li>
                )}
              </>
              <li data-current={!needsBuild}>2 출전 지정</li>
              <li>3 AI 연습</li>
            </ol>
          )}
          <button
            ref={trigger}
            type="button"
            disabled={saving}
            onClick={() =>
              kind === "ERROR" ? setRetry((x) => x + 1) : setOpen(true)
            }
          >
            {kind === "ERROR"
              ? "다시 확인"
              : poster
                ? "덱 변경"
                : "출전 덱 고르기"}
          </button>
          {kind === "INVALID" && (
            <button
              type="button"
              onClick={() => navigate(launchDeckEditor(deck?.id))}
            >
              덱 수정
            </button>
          )}
        </div>
      </aside>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent
          className="ko-home-deck-picker bg-neutral-950 text-neutral-100"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>출전 덱 선택</DialogTitle>
          <DialogDescription>
            선택하면 빠른 대전과 AI 대전에 바로 사용합니다. 덱 내용은 편집기에서
            수정하세요.
          </DialogDescription>
          <input
            aria-label="출전 덱 검색"
            placeholder="덱·챔피언 검색"
            className="min-h-11 border border-neutral-700 bg-black px-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {selectionError && <p role="alert">{selectionError}</p>}
          {Boolean(decks?.length) && !options.length && (
            <p>
              검색 결과가 없어요. 덱 이름이나 챔피언 이름을 바꿔 검색하세요.
            </p>
          )}
          {decks?.length ? (
            <div className="ko-home-deck-options">
              {options.map((d) => (
                <article key={d.id} data-current={d.isSelected}>
                  <div>
                    <strong>{d.name}</strong>
                    <p>{d.champion?.name ?? "챔피언 미지정"}</p>
                    <DeckComposition
                      deck={d}
                      className="ko-home-picker-composition"
                    />
                    {!d.isValid && (
                      <p className="text-sm text-amber-200">
                        {d.invalidReasons?.join(" ") || "덱 수정이 필요해요."}
                      </p>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={saving || !d.isValid || d.isSelected}
                      onClick={() => void choose(d)}
                    >
                      {d.isSelected ? "출전 중" : "이 덱 사용"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => navigate(launchDeckEditor(d.id))}
                    >
                      편집
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>
              저장된 덱이 없어요. 챔피언과 카드를 골라 첫 덱을 만들어 주세요.
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => navigate("/decks")}
          >
            새 덱 만들기
          </button>
          {saving && <p role="status">출전 덱을 저장하고 있어요…</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeckComposition({
  deck,
  className,
}: {
  deck: Deck;
  className: string;
}) {
  const summary = homeDeckSummary(deck);
  return summary ? (
    <p className={className}>
      평균 {summary.average.toFixed(1)} · 선수 {summary.wrestlers} / 주문{" "}
      {summary.spells}
    </p>
  ) : null;
}

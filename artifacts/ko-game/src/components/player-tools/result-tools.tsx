import "./player-tools.css";
import { useEffect, useState, useRef } from "react";
import { useShelf } from "./shelf";
import type { GameState } from "@/game";
export type DeckRecord = { id: string; name: string };
/** Capture visible game DOM locally. Never upload match or account data. */
export async function saveResultPoster(state: GameState) {
  const root =
    (state.status === "FINISHED"
      ? document.querySelector<HTMLElement>(".ko-game-shell")
      : null) ?? document.getElementById("root");
  if (!root) throw Error("전투 화면을 찾지 못했습니다.");
  const { toBlob } = await import("html-to-image");
  let blob = await toBlob(root, {
    width: innerWidth,
    height: innerHeight,
    pixelRatio: innerWidth < 768 ? 2 : 1.5,
    backgroundColor: "#10100f",
    filter: (n) =>
      !(n instanceof HTMLElement && n.hasAttribute("data-capture-exclude")),
  });
  if (!blob) throw Error("이미지 생성 실패");
  const image = await createImageBitmap(blob),
    canvas = document.createElement("canvas");
  const band = Math.max(36, Math.round(image.width * 0.055));
  canvas.width = image.width;
  canvas.height = image.height + band;
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(image, 0, 0);
    context.fillStyle = "#10100f";
    context.fillRect(0, image.height, image.width, band);
    context.fillStyle = "#ddc58a";
    context.font = `bold ${Math.round(band * 0.48)}px sans-serif`;
    context.textAlign = "right";
    context.fillText(
      (state.status === "FINISHED"
        ? state.winnerId === state.players[0].id
          ? "VICTORY · "
          : state.loserId === state.players[0].id
            ? "DEFEAT · "
            : "MATCH END · "
        : "") + "KO CARD GAME",
      image.width - 16,
      image.height + band * 0.68,
    );
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (v) => (v ? resolve(v) : reject(Error("저장 실패"))),
        "image/png",
      ),
    );
  }
  image.close();
  const file = new File(
    [blob],
    "KO-" + state.gameId.replace(/[^a-z0-9-]/gi, "").slice(0, 60) + ".png",
    { type: "image/png" },
  );
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "KO CARD GAME 경기 장면" });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function SaveBattleImage({ state }: { state: GameState }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span data-capture-exclude>
      <button
        className="min-h-11 border border-amber-800 px-2"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await saveResultPoster(state);
          } catch (e) {
            if ((e as Error).name !== "AbortError")
              setError(
                "저장 실패: 브라우저의 이미지 접근·다운로드 권한을 확인하세요.",
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "이미지 만드는 중…" : "현재 전장 이미지 저장"}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
export function ResultTools({
  state,
  deck,
  onRematch,
  onChooseDeck,
  disabled,
}: {
  state: GameState;
  deck?: DeckRecord;
  onRematch?: () => void | Promise<void>;
  onChooseDeck?: () => void;
  disabled?: boolean;
}) {
  const shelf = useShelf(),
    launch = shelf.data.launches?.[state.gameId],
    resolvedDeck = deck ?? launch,
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const owner = useRef<{ match: string; id: string } | null>(null);
  useEffect(() => {
    if (shelf.id && (!owner.current || owner.current.match !== state.gameId))
      owner.current = { match: state.gameId, id: shelf.id };
    if (owner.current?.id !== shelf.id) return;
    if (shelf.id && state.status === "FINISHED")
      shelf.update((s) =>
        s.matches.some((m) => m.id === state.gameId)
          ? {
              ...s,
              matches: s.matches.map((m) =>
                m.id === state.gameId && resolvedDeck
                  ? {
                      ...m,
                      deckId: resolvedDeck.id,
                      deckName: resolvedDeck.name,
                      mode:
                        launch?.mode ??
                        (deck ? ("AI" as const) : ("OTHER" as const)),
                    }
                  : m,
              ),
            }
          : {
              ...s,
              matches: [
                {
                  id: state.gameId,
                  mode:
                    launch?.mode ??
                    (deck ? ("AI" as const) : ("OTHER" as const)),
                  deckId: resolvedDeck?.id,
                  deckName: resolvedDeck?.name,
                  opponent: state.players[1].champion?.name ?? "상대",
                  result:
                    state.winnerId === state.players[0].id
                      ? ("승리" as const)
                      : state.loserId === state.players[0].id
                        ? ("패배" as const)
                        : ("무승부" as const),
                  at: Date.now(),
                },
                ...s.matches,
              ].slice(0, 200),
            },
      );
  }, [shelf.id, state.gameId, state.status, resolvedDeck?.id]);
  return (
    <div
      data-capture-exclude
      className="ko-player-result-tools flex flex-wrap gap-2 border-t border-amber-900 py-3"
    >
      {onRematch && (
        <button
          className="min-h-11 border border-amber-600 px-3"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRematch();
            } catch {
              setNotice("다음 대전을 준비하지 못했어요. 다시 시도하세요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          같은 덱으로 다음 대전
        </button>
      )}
      {!onRematch && launch?.mode === "QUICK" && (
        <button
          className="min-h-11 border px-3"
          disabled={disabled}
          onClick={() =>
            window.location.assign(
              "/online/quick?repeat=" + encodeURIComponent(launch.id),
            )
          }
        >
          같은 덱으로 빠른 대전
        </button>
      )}
      {onChooseDeck && (
        <button
          className="min-h-11 border px-3"
          disabled={disabled}
          onClick={onChooseDeck}
        >
          덱 바꿔 대전
        </button>
      )}
      <button
        className="min-h-11 border px-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveResultPoster(state);
            setNotice("결과 기념 이미지를 저장·공유했습니다.");
          } catch (e) {
            if ((e as Error).name !== "AbortError")
              setNotice(
                "이미지를 저장하지 못했습니다. 브라우저 다운로드 권한을 확인하세요.",
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        경기 기념 이미지 저장
      </button>
      <a className="min-h-11 p-2" href="/player-notebook">
        내 전적
      </a>
      {(notice || shelf.error) && <p role="status">{notice || shelf.error}</p>}
    </div>
  );
}

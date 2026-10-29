import { useEffect } from "react";
import { useShelf, type Wish } from "./shelf";
export function WishButton({ item }: { item: Wish }) {
  const shelf = useShelf(),
    on = shelf.data.wishes.some(
      (w) => w.id === item.id && w.kind === item.kind,
    );
  return (
    <span>
      <button
        type="button"
        disabled={!shelf.id}
        aria-pressed={on}
        className="min-h-11 border border-amber-800 px-3 text-amber-200"
        onClick={(e) => {
          e.stopPropagation();
          shelf.update((s) => ({
            ...s,
            wishes: s.wishes.some(
              (w) => w.id === item.id && w.kind === item.kind,
            )
              ? s.wishes.filter((w) => w.id !== item.id || w.kind !== item.kind)
              : [...s.wishes, item].slice(-500),
          }));
        }}
      >
        {on ? "★ 수집 목표 해제" : "☆ 수집 목표로 찜"}
      </button>
      {shelf.error && <small role="alert">{shelf.error}</small>}
    </span>
  );
}
export function WishlistArrivals({
  owned,
  kind,
}: {
  owned: string[];
  kind: Wish["kind"];
}) {
  const shelf = useShelf(),
    key = owned.slice().sort().join("|");
  useEffect(() => {
    if (
      shelf.id &&
      shelf.data.wishes.some(
        (w) => w.kind === kind && !w.acquired && owned.includes(w.id),
      )
    )
      shelf.update((s) => ({
        ...s,
        wishes: s.wishes.map((w) =>
          w.kind === kind && owned.includes(w.id)
            ? { ...w, acquired: true }
            : w,
        ),
      }));
  }, [shelf.id, key, shelf.data.wishes]);
  const achieved = shelf.data.wishes.filter(
    (w) => w.kind === kind && w.acquired,
  );
  return achieved.length ? (
    <p role="status" className="my-3 text-amber-200">
      수집 목표 달성:{" "}
      {achieved
        .slice(0, 5)
        .map((w) => w.name)
        .join(", ")}{" "}
      · <a href="/player-notebook">내 기록에서 확인</a>
    </p>
  ) : null;
}

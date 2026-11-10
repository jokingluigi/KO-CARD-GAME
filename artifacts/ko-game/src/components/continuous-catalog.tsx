import { useEffect, useRef, useState, type RefObject } from "react";
import { useBrowsingState } from "./player-ux/browsing-state";
const BATCH = 40;
type Snapshot = { query: string; count: number; scroll: number };
function read(key: string): Snapshot | null {
  try {
    const v = JSON.parse(sessionStorage.getItem("ko-catalog:" + key) ?? "null");
    return v &&
      typeof v.query === "string" &&
      Number.isSafeInteger(v.count) &&
      v.count >= BATCH &&
      v.count <= 10000 &&
      Number.isFinite(v.scroll)
      ? v
      : null;
  } catch {
    return null;
  }
}
function hostFor(node: HTMLElement): HTMLElement | Window {
  let parent = node.parentElement;
  while (parent) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return window;
}
function position(host: HTMLElement | Window) {
  return host === window ? window.scrollY : (host as HTMLElement).scrollTop;
}
/** Preserve append count and scroll across route changes without persisting inventory. */
export function useContinuousCatalog(
  key: string,
  query: string,
  total: number,
  ready: boolean,
  root: RefObject<HTMLElement | null>,
  view = "",
) {
  const [count, setCount] = useState(() => {
    const saved = read(key);
    return saved?.query === query ? saved.count : BATCH;
  });
  const previousQuery = useRef(query),
    current = useRef({ query, count }),
    sentinel = useRef<HTMLDivElement>(null);
  const effective = previousQuery.current === query ? count : BATCH;
  current.current = { query, count: effective };
  useEffect(() => {
    if (previousQuery.current !== query) {
      previousQuery.current = query;
      setCount(BATCH);
    }
  }, [query]);
  useEffect(() => {
    if (
      !ready ||
      !root.current ||
      root.current.getBoundingClientRect().width === 0
    )
      return;
    const host = hostFor(root.current),
      saved = read(key);
    let frame = 0;
    const save = () => {
      if (
        !root.current ||
        root.current.getBoundingClientRect().width === 0 ||
        document.querySelector('[role="dialog"]')
      )
        return;
      try {
        sessionStorage.setItem(
          "ko-catalog:" + key,
          JSON.stringify({ ...current.current, scroll: position(host) }),
        );
      } catch {}
    };
    if (saved?.query === current.current.query)
      frame = requestAnimationFrame(() => {
        host.scrollTo({ top: saved.scroll, behavior: "instant" });
      });
    host.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      cancelAnimationFrame(frame);
      save();
      host.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [key, ready, root, view]);
  useEffect(() => {
    const saved = read(key);
    try {
      sessionStorage.setItem(
        "ko-catalog:" + key,
        JSON.stringify({
          ...current.current,
          scroll: saved?.query === query ? saved.scroll : 0,
        }),
      );
    } catch {}
  }, [key, query, effective]);
  useEffect(() => {
    if (
      !ready ||
      effective >= total ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting))
          setCount((c) => Math.min(10000, c + BATCH));
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [ready, total, effective, query]);
  return {
    limit: Math.min(effective, total),
    sentinel,
    more: () => setCount((c) => Math.min(10000, c + BATCH)),
  };
}
export function CatalogContinuation({
  catalog,
  total,
}: {
  catalog: ReturnType<typeof useContinuousCatalog>;
  total: number;
}) {
  return (
    <div
      ref={catalog.sentinel}
      className="ko-catalog-continuation"
      data-testid="catalog-continuation"
    >
      <span role="status">
        {catalog.limit} / {total}장 표시
        {catalog.limit >= total ? " · 마지막 카드까지 확인했어요" : ""}
      </span>
      {catalog.limit < total && (
        <button type="button" onClick={catalog.more}>
          카드 40장 더 보기
        </button>
      )}
    </div>
  );
}
export function useCatalogDensity() {
  return useBrowsingState<"compact" | "large">(
    "catalog:density",
    "compact",
    (v) => v === "compact" || v === "large",
  );
}
export function CatalogDensity({
  value,
  onChange,
}: {
  value: "compact" | "large";
  onChange: (v: "compact" | "large") => void;
}) {
  return (
    <div
      className="ko-catalog-density"
      role="group"
      aria-label="카드 표시 크기"
    >
      <button
        type="button"
        aria-pressed={value === "compact"}
        onClick={() => onChange("compact")}
      >
        모아 보기
      </button>
      <button
        type="button"
        aria-pressed={value === "large"}
        onClick={() => onChange("large")}
      >
        크게 보기
      </button>
    </div>
  );
}

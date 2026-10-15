import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CardRulesText } from "../../src/components/card-rules-text";

const compactRules = [
  ".qa-mini-card .line-clamp-6",
  ".qa-detail-card .line-clamp-6",
  ".ko-game-shell .line-clamp-6",
  '[role="dialog"] .line-clamp-6',
  '[aria-label="상세정보"] .line-clamp-6',
]
  .map((selector) => `${selector}:not(.qa-rules-copy)`)
  .join(",");

type Copy = {
  source: HTMLElement;
  box: HTMLElement;
  text: string;
  original: string;
  lines: number;
  interactive: boolean;
  key: number;
};

/** QA-only: retain React's original rich text; render an abbreviated rich-text sibling. */
export function CompactRulesPreview() {
  const [copies, setCopies] = useState<Copy[]>([]);
  useLayoutEffect(() => {
    if (
      document.documentElement.dataset.fontMode === "baseline" ||
      new URLSearchParams(location.search).get("ellipsis") === "off"
    )
      return;
    let frame = 0;
    let disposed = false;
    let nextKey = 0;
    const sources = new Map<
      HTMLElement,
      { key: number; style: string | null }
    >();
    const observed = new Set<HTMLElement>();
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;display:block;padding:0;border:0;pointer-events:none";
    document.body.append(probe);
    const measure = () => {
      frame = 0;
      for (const box of observed)
        if (!box.isConnected) {
          resize.unobserve(box);
          observed.delete(box);
        }
      const next: Copy[] = [];
      for (const source of document.querySelectorAll<HTMLElement>(
        compactRules,
      )) {
        const box = source.parentElement;
        if (!box) continue;
        const boxStyle = getComputedStyle(box);
        const style = getComputedStyle(source);
        const lineHeight = parseFloat(style.lineHeight);
        const available =
          box.clientHeight -
          parseFloat(boxStyle.paddingTop) -
          parseFloat(boxStyle.paddingBottom);
        const width =
          box.clientWidth -
          parseFloat(boxStyle.paddingLeft) -
          parseFloat(boxStyle.paddingRight);
        if (!Number.isFinite(lineHeight) || available <= 0 || width <= 0)
          continue;
        const lines = Math.max(1, Math.floor(available / lineHeight));
        const original = source.textContent ?? "";
        for (const property of [
          "font-family",
          "font-size",
          "font-weight",
          "font-style",
          "line-height",
          "letter-spacing",
          "white-space",
          "word-break",
          "overflow-wrap",
          "font-synthesis",
        ]) {
          probe.style.setProperty(property, style.getPropertyValue(property));
        }
        probe.style.width = `${width}px`;
        probe.textContent = original;
        let text = original;
        if (probe.getBoundingClientRect().height > lines * lineHeight + 0.5) {
          const characters = Array.from(original);
          let low = 0,
            high = characters.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            probe.textContent =
              characters.slice(0, middle).join("").trimEnd() + "....";
            if (
              probe.getBoundingClientRect().height <=
              lines * lineHeight + 0.5
            )
              low = middle;
            else high = middle - 1;
          }
          text = characters.slice(0, low).join("").trimEnd() + "....";
        }
        if (!sources.has(source)) {
          sources.set(source, {
            key: nextKey++,
            style: source.getAttribute("style"),
          });
          source.dataset.qaSourceRules = "true";
        }
        if (!observed.has(box)) {
          observed.add(box);
          resize.observe(box);
        }
        next.push({
          source,
          box,
          original,
          text,
          lines,
          key: sources.get(source)!.key,
          interactive: !!source.querySelector('[role="button"]'),
        });
      }
      setCopies((previous) =>
        previous.length === next.length &&
        previous.every((copy, i) => {
          const other = next[i];
          return (
            copy.source === other.source &&
            copy.text === other.text &&
            copy.original === other.original &&
            copy.lines === other.lines &&
            copy.interactive === other.interactive
          );
        })
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) => record.target !== probe && !probe.contains(record.target),
        )
      )
        schedule();
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(schedule);
    measure();
    return () => {
      disposed = true;
      resize.disconnect();
      mutations.disconnect();
      probe.remove();
      document.fonts.removeEventListener("loadingdone", schedule);
      cancelAnimationFrame(frame);
      for (const [source, saved] of sources) {
        delete source.dataset.qaSourceRules;
        if (saved.style === null) source.removeAttribute("style");
        else source.setAttribute("style", saved.style);
      }
    };
  }, []);
  return copies.map((copy) =>
    createPortal(
      <span
        className={`${copy.source.className} qa-rules-copy`}
        data-qa-compact-rules="true"
        data-qa-truncated={String(copy.text !== copy.original)}
        data-qa-original={copy.original}
        style={{ "--qa-rules-lines": copy.lines } as React.CSSProperties}
      >
        <CardRulesText text={copy.text} interactive={copy.interactive} />
      </span>,
      copy.box,
      String(copy.key),
    ),
  );
}

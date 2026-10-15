import { useLayoutEffect } from "react";

const compactRules = [
  ".qa-mini-card .line-clamp-6",
  ".qa-detail-card .line-clamp-6",
  ".ko-game-shell .line-clamp-6",
  '[role="dialog"] .line-clamp-6',
  '[aria-label="상세정보"] .line-clamp-6',
].join(",");

/** QA-only presentation: keep the original rich text and clamp to whole lines. */
export function CompactRulesPreview() {
  useLayoutEffect(() => {
    if (
      document.documentElement.dataset.fontMode === "baseline" ||
      new URLSearchParams(location.search).get("ellipsis") === "off"
    )
      return;
    let frame = 0;
    let disposed = false;
    const observed = new Set<HTMLElement>();
    const measure = () => {
      frame = 0;
      for (const box of observed)
        if (!box.isConnected) {
          resize.unobserve(box);
          observed.delete(box);
        }
      for (const text of document.querySelectorAll<HTMLElement>(compactRules)) {
        const box = text.parentElement;
        if (!box) continue;
        text.dataset.qaCompactRules = "true";
        if (!observed.has(box)) {
          observed.add(box);
          resize.observe(box);
        }
        const boxStyle = getComputedStyle(box);
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        const available =
          box.clientHeight -
          parseFloat(boxStyle.paddingTop) -
          parseFloat(boxStyle.paddingBottom);
        if (!Number.isFinite(lineHeight) || available <= 0) continue;
        const lines = Math.max(1, Math.floor(available / lineHeight));
        text.style.setProperty("--qa-rules-lines", String(lines));
        // Measure without the marker gutter, so a resize can restore full text.
        text.dataset.qaTruncated = "false";
        text.dataset.qaTruncated = String(
          text.scrollHeight > lines * lineHeight + 1,
        );
      }
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
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
      document.fonts.removeEventListener("loadingdone", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

import { createContext, useLayoutEffect, useRef, useState } from "react";
import { CardRulesText } from "./card-rules-text";

/** The archived QA comparison can still render the original, unfitted card face. */
export const FittedCardRulesContext = createContext(true);

/** Fit a card-face snippet; the detail dialog continues to render the full effect. */
export function FittedCardRules({
  text,
  interactive,
  className,
}: {
  text: string;
  interactive: boolean;
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [copy, setCopy] = useState({ original: text, value: text });
  const visible = copy.original === text ? copy.value : text;
  useLayoutEffect(() => {
    const element = ref.current;
    const box = element?.parentElement;
    if (!element || !box) return;
    let disposed = false;
    let frame = 0;
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;display:block;padding:0;border:0;pointer-events:none";
    document.body.append(probe);
    const measure = () => {
      frame = 0;
      if (disposed) return;
      const style = getComputedStyle(element),
        parent = getComputedStyle(box);
      const line = parseFloat(style.lineHeight);
      const height =
        box.clientHeight -
        parseFloat(parent.paddingTop) -
        parseFloat(parent.paddingBottom);
      const width =
        box.clientWidth -
        parseFloat(parent.paddingLeft) -
        parseFloat(parent.paddingRight);
      if (!Number.isFinite(line) || height <= 0 || width <= 0) return;
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
      const limit = Math.max(1, Math.floor(height / line)) * line;
      probe.textContent = text;
      let value = text;
      if (probe.getBoundingClientRect().height > limit + 0.5) {
        const characters = Array.from(text);
        let low = 0,
          high = characters.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          probe.textContent =
            characters.slice(0, middle).join("").trimEnd() + "....";
          if (probe.getBoundingClientRect().height <= limit + 0.5) low = middle;
          else high = middle - 1;
        }
        value = characters.slice(0, low).join("").trimEnd() + "....";
      }
      setCopy((previous) =>
        previous.original === text && previous.value === value
          ? previous
          : { original: text, value },
      );
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(schedule);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
      probe.remove();
    };
  }, [text, className]);
  return (
    <span
      ref={ref}
      className={`ko-card-rules-copy ${className}`}
      data-card-rules="true"
      data-truncated={String(visible !== text)}
      data-full-text={text}
    >
      <CardRulesText text={visible} interactive={interactive} />
    </span>
  );
}

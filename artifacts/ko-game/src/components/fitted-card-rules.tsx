import { createContext, useLayoutEffect, useRef, useState } from "react";
import { CardRulesText } from "./card-rules-text";

/** The archived QA comparison can still render the original, unfitted card face. */
export const FittedCardRulesContext = createContext(true);

/** Fit a card-face snippet; the detail dialog continues to render the full effect. */
export function FittedCardRules({
  text,
  fitFull = false,
  fitThenClip = false,
  interactive,
  className,
}: {
  text: string;
  fitFull?: boolean;
  /** 읽을 수 있는 최소 크기까지만 줄이고, 그래도 넘치면 "…"로 자른다(스크롤 없음). */
  fitThenClip?: boolean;
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
      if (fitFull || fitThenClip) element.style.fontSize = "";
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
      let limit = Math.max(1, Math.floor(height / line)) * line;
      probe.textContent = text;
      if (fitThenClip) {
        // 카드 크기에 비례한 최소 글자 크기: 기본의 70% 또는 11px 중 큰 값(너무 작게 줄이지 않는다).
        const base = parseFloat(style.fontSize),
          ratio = line / base,
          floor = Math.min(base, Math.max(11, base * 0.7));
        let chosen = base;
        for (; chosen > floor; chosen -= 0.25) {
          probe.style.fontSize = `${chosen}px`;
          probe.style.lineHeight = `${chosen * ratio}px`;
          if (probe.getBoundingClientRect().height <= height + 0.5) break;
        }
        chosen = Math.max(floor, chosen);
        element.style.fontSize = `${chosen}px`;
        probe.style.fontSize = `${chosen}px`;
        probe.style.lineHeight = `${chosen * ratio}px`;
        limit = Math.max(1, Math.floor(height / (chosen * ratio))) * chosen * ratio;
      }
      if (fitFull) {
        const base = parseFloat(style.fontSize),
          ratio = line / base;
        let chosen = base;
        for (; chosen > 8; chosen -= 0.25) {
          probe.style.fontSize = `${chosen}px`;
          probe.style.lineHeight = `${chosen * ratio}px`;
          if (probe.getBoundingClientRect().height <= height + 0.5) break;
        }
        element.style.fontSize = `${Math.max(8, chosen)}px`;
        setCopy((previous) =>
          previous.original === text && previous.value === text
            ? previous
            : { original: text, value: text },
        );
        return;
      }
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
  }, [text, className, fitFull, fitThenClip]);
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

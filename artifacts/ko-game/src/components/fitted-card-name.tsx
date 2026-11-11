import { useLayoutEffect, useRef } from "react";
/** Keep the complete title within the actual frame nameplate, including late-loaded custom frames. */
export function FittedCardName({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current,
      box = element?.parentElement;
    if (!element || !box) return;
    let disposed = false,
      frame = 0;
    const measure = () => {
      frame = 0;
      if (disposed || !box.clientWidth || !box.clientHeight) return;
      element.style.fontSize = "";
      const style = getComputedStyle(element),
        base = parseFloat(style.fontSize),
        line = parseFloat(style.lineHeight);
      const parent = getComputedStyle(box);
      const height =
          box.clientHeight -
          parseFloat(parent.paddingTop) -
          parseFloat(parent.paddingBottom),
        width = element.clientWidth;
      if (!base || !line || !width) return;
      const ratio = Math.min(
        1,
        width / Math.max(width, element.scrollWidth),
        height / line,
      );
      element.style.fontSize = `${Math.max(4, base * ratio * 0.97)}px`;
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(schedule);
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [text, className]);
  return (
    <span
      ref={ref}
      title={text}
      className={`block w-full overflow-hidden whitespace-nowrap ${className}`}
    >
      {text}
    </span>
  );
}

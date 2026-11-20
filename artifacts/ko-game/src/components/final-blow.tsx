import { createPortal } from "react-dom";
import "./final-blow.css";

/** Final-blow lens: a flash on impact, then everything but the beaten champion fades to grey and dark. */
export function FinalBlowLens({ x, y, fading }: { x: number; y: number; fading: boolean }) {
  return createPortal(
    <div className="ko-final-lens" data-fading={fading || undefined} aria-hidden="true"
      style={{ ["--fx" as string]: `${x}px`, ["--fy" as string]: `${y}px` }}>
      <div className="ko-final-lens__flash" />
      <div className="ko-final-lens__lines" />
    </div>,
    document.body,
  );
}

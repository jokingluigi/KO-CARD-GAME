import { createPortal } from "react-dom";
import "./final-blow.css";

/** Final-blow lens: everything but the beaten champion fades to grey and dark; a flash marks the hit. */
export function FinalBlowLens({ x, y, fading, strike = false, flash = true }: { x: number; y: number; fading: boolean; strike?: boolean; flash?: boolean }) {
  return createPortal(
    <div className="ko-final-lens" data-strike={strike || undefined} data-fading={fading || undefined} aria-hidden="true"
      style={{ ["--fx" as string]: `${x}px`, ["--fy" as string]: `${y}px` }}>
      {flash && <div className="ko-final-lens__flash" />}
      <div className="ko-final-lens__lines" />
    </div>,
    document.body,
  );
}

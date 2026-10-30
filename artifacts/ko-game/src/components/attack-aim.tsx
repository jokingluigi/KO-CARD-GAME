import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
export function AttackAim({
  source,
  targets,
  champion,
  championId,
  valid,
}: {
  source: HTMLElement | null;
  targets: RefObject<Map<string, HTMLDivElement>>;
  champion: HTMLElement | null;
  championId: string;
  valid: Set<string>;
}) {
  const line = useRef<SVGLineElement>(null);
  const contact = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const move = (e: {clientX:number;clientY:number}) => {
      if (!source || !line.current) return;
      const node = [
        ...targets.current.entries(),
        [championId, champion] as const,
      ].find(([id, n]) => {
        if (!n || !valid.has(id)) return false;
        const r = n.getBoundingClientRect();
        return (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      })?.[1];
      line.current.style.opacity = node ? "1" : "0";
      if(contact.current)contact.current.style.opacity=node?"1":"0";
      if (node) {
        const s = source.getBoundingClientRect(),
          t = node.getBoundingClientRect();
        contact.current?.setAttribute("cx",String(t.left+t.width/2));
        contact.current?.setAttribute("cy",String(t.top+t.height*.7));
        for (const [k, v] of Object.entries({
          x1: s.left + s.width / 2,
          y1: s.top + s.height * 0.3,
          x2: t.left + t.width / 2,
          y2: t.top + t.height * 0.7,
        }))
          line.current.setAttribute(k, String(v));
      }
    };
    const clear=()=>{if(line.current)line.current.style.opacity='0';if(contact.current)contact.current.style.opacity='0';};
    const focus=(e:FocusEvent)=>{if(!(e.target instanceof Element))return;const r=e.target.getBoundingClientRect();move({clientX:r.x+r.width/2,clientY:r.y+r.height/2});};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerdown",move);
    window.addEventListener("focusin",focus);
    window.addEventListener("resize",clear);
    window.addEventListener("blur",clear);
    window.addEventListener("scroll",clear,true);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerdown",move);window.removeEventListener("focusin",focus);window.removeEventListener("resize",clear);window.removeEventListener("blur",clear);window.removeEventListener("scroll",clear,true);};
  }, [source, targets, champion, championId, valid]);
  return createPortal(
    <svg aria-hidden="true" className="ko-attack-aim">
      <line
        ref={line}
        stroke="#e8c367"
        strokeWidth="3"
        strokeDasharray="8 4"
        style={{ opacity: 0 }}
      />
      <circle ref={contact} r="7" fill="none" stroke="#e8c367" strokeWidth="2" style={{opacity:0}}/>
    </svg>,
    document.body,
  );
}

import { useState } from "react";
import type { BestHit } from "./battle-juice";
import "./battle-juice.css";

/** 45. 경기가 끝나면 가장 큰 한 방을 슬로우모션으로 다시 보여준다. 누르면 다시 재생. */
export function BestHitReplay({ hit }: { hit: BestHit }) {
  const [take, setTake] = useState(0);
  return (
    <button type="button" className="kj-best-hit" data-finisher={hit.finisher || undefined} onClick={() => setTake((n) => n + 1)}
      aria-label={`최고의 한 방: ${hit.attacker}, ${hit.target}에게 ${hit.damage} 피해. 눌러서 다시 보기`}>
      <span className="kj-best-hit__label">BEST HIT · 최고의 한 방</span>
      <span key={take} className="kj-best-hit__stage" aria-hidden="true">
        {hit.art ? <img src={hit.art} alt="" draggable={false} /> : <i className="kj-best-hit__blank" />}
        <span className="kj-best-hit__flash" />
        <b className="kj-best-hit__dmg">{hit.damage}</b>
      </span>
      <span className="kj-best-hit__who"><strong>{hit.attacker}</strong> → {hit.target}</span>
      <small>눌러서 다시 보기</small>
    </button>
  );
}

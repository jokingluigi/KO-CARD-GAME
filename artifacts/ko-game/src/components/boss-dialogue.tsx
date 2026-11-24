import { useEffect, useMemo, useState } from 'react';
import type { BossDialogueLine } from '@/game';
import './boss-dialogue.css';

export type DialogueActor = { name: string; image: (expression?: string | null) => string | null };

/** RPG식 대화창: 보스 혼자 말한다. 나레이션 때는 보스가 어두워진다. 탭하면 다음, 건너뛰기 가능. */
export function BossDialogue({ lines, boss, banner, onDone }: {
  lines: BossDialogueLine[];
  boss: DialogueActor;
  banner?: { title: string; subtitle?: string } | null;
  onDone: () => void;
}) {
  const playable = useMemo(() => lines.filter((line) => line.text.trim()), [lines]);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [showBanner, setShowBanner] = useState(Boolean(banner));
  const line = playable[index];
  const full = line?.text ?? '';
  const typing = shown < full.length;

  useEffect(() => {
    if (!showBanner) return;
    const timer = window.setTimeout(() => { setShowBanner(false); if (!playable.length) onDone(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [showBanner, playable.length, onDone]);
  useEffect(() => { if (!showBanner && !playable.length) onDone(); }, [showBanner, playable.length, onDone]);
  useEffect(() => { setShown(0); }, [index]);
  useEffect(() => {
    if (showBanner || !typing) return;
    const timer = window.setTimeout(() => setShown((count) => Math.min(full.length, count + 1)), 28);
    return () => window.clearTimeout(timer);
  }, [showBanner, typing, shown, full.length]);

  const next = () => {
    if (showBanner) { setShowBanner(false); return; }
    if (typing) { setShown(full.length); return; }
    if (index + 1 < playable.length) setIndex(index + 1); else onDone();
  };
  const speaker = line?.speaker ?? 'NARRATOR';
  const bossImage = boss.image(speaker === 'BOSS' ? line?.expression : null);
  const name = speaker === 'BOSS' ? boss.name : '';

  return (
    <div className={`boss-dialogue ${!showBanner && line?.effect === 'SHAKE' ? 'is-shake' : ''}`} key={`line-${index}`} onClick={next} role="dialog" aria-label="보스 대화" data-testid="boss-dialogue">
      {!showBanner && line?.effect === 'FLASH' && <div className="boss-dialogue__flash" />}
      <button type="button" className="boss-dialogue__skip" onClick={(event) => { event.stopPropagation(); onDone(); }}>건너뛰기 ▶▶</button>
      {showBanner && banner ? (
        <div className="boss-dialogue__banner">
          <span>{banner.title}</span>
          {banner.subtitle && <small>{banner.subtitle}</small>}
        </div>
      ) : line ? (
        <>
          <div className={`boss-dialogue__actor is-center ${speaker === 'BOSS' ? 'is-speaking' : ''}`}>
            {bossImage && <img src={bossImage} alt="" draggable={false} />}
          </div>
          <div className={`boss-dialogue__box ${speaker === 'NARRATOR' ? 'is-narration' : ''}`}>
            {name && <div className="boss-dialogue__name">{name}</div>}
            <p>{full.slice(0, shown)}<span className="boss-dialogue__caret">{typing ? '' : '▼'}</span></p>
            <div className="boss-dialogue__count">{index + 1} / {playable.length}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CHAMPION_EMOTES, CHAMPION_EMOTE_LABELS, type ChampionEmote } from '@/game/champions/types';

export function ChampionEmoteMenu({ anchor, onEmote, onClose }: { anchor: RefObject<HTMLDivElement | null>; onEmote: (emote: ChampionEmote) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 240, maxHeight: 320 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const x = viewport?.offsetLeft ?? 0; const y = viewport?.offsetTop ?? 0;
      const menuWidth = Math.min(240, width - 16);
      const menuHeight = Math.min(164, height - 16);
      setPosition({ left: Math.max(x + 8, Math.min(rect.left, x + width - menuWidth - 8)),
        top: Math.max(y + 8, Math.min(rect.top - menuHeight - 8, y + height - menuHeight - 8)), width: menuWidth, maxHeight: height - 16 });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);
  return createPortal(<div ref={menu} role="menu" aria-label="챔피언 감정표현" style={position} className="fixed z-[400] grid grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-amber-400/70 bg-neutral-950 p-2 shadow-2xl">
    {CHAMPION_EMOTES.map(emote => <button key={emote} type="button" role="menuitem" onClick={() => { onEmote(emote); onClose(); }} className="min-h-11 rounded bg-neutral-800 px-3 py-2 text-sm text-white hover:bg-amber-700">{CHAMPION_EMOTE_LABELS[emote]}</button>)}
  </div>, document.body);
}

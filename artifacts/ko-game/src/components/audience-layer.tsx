import React from 'react';
import { audioManager } from '../audio/audio-manager';
import { readCombatPreferences } from './combat-preferences';
import { onAudience, type AudienceMood, type AudienceSignal } from './audience-bus';
import './audience-layer.css';

/**
 * 관중 연출 (화면·소리 전용).
 * 1. 관중 실루엣(CC0 그림) — 평소엔 안 보이고, 큰 타격·결정타·위기 응원·야유·전설 등장 때만
 *    화면 아래에서 튀어올라 반응하고 내려간다
 * 2. 경기 내내 깔리는 웅성거림 — 긴장될수록 커짐
 * 3. 위기(체력 5 이하) 때 "쿵쿵 짝!" 응원 박자
 * 4. 관중 외침 말풍선
 * 5. 야유
 * 6. TV 중계 자막
 * 7. 관중 수(LIVE) — 관중이 나와 있을 때만
 */
const SYN = (name: string) => `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

const CROWD = (name: string) => `${import.meta.env.BASE_URL}vendor/crowd/${name}.webp`;

/** 관중이 튀어나오는 분위기만 (평소·긴장은 화면에 안 나옴) */
type PopMood = Exclude<AudienceMood, 'idle' | 'tense'>;
const POP_MS: Record<PopMood, number> = { excited: 1700, stand: 2500, wave: 4800, chant: 3800, boo: 2300 };
const POP_RANK: Record<PopMood, number> = { excited: 1, boo: 2, stand: 3, chant: 3, wave: 4 };

/** 1. 관중석: 화면 아래에서 튀어올라 반응하고 다시 내려간다 (CC0 실루엣 그림) */
const CrowdPop = React.memo(function CrowdPop({ mood, leaving, children }: { mood: PopMood; leaving: boolean; children?: React.ReactNode }) {
  const kind = mood === 'boo' ? 'calm' : 'cheer';
  return (
    <div className={`ka-pop${leaving ? ' is-leaving' : ''}`} data-mood={mood} aria-hidden="true">
      <span className="ka-pop__glow" />
      <span className="ka-pop__row ka-pop__row--back" style={{ backgroundImage: `url(${CROWD(`crowd-${kind}-back`)})` }} />
      <span className="ka-pop__row ka-pop__row--front" style={{ backgroundImage: `url(${CROWD(`crowd-${kind}-front`)})` }} />
      {mood !== 'boo' && <span className="ka-pop__flashes" />}
      {children}
    </div>
  );
});

const liveCounts = new Map<string, number>();
function liveCount(gameId: string) {
  let n = liveCounts.get(gameId);
  if (n == null) { n = 8000 + Math.floor(seeded(gameId)() * 7000); liveCounts.set(gameId, n); }
  return n;
}
function addLive(gameId: string, amount: number) { liveCounts.set(gameId, liveCount(gameId) + amount); }

/** 7. 관중 수 (따로 떼어서 숫자가 바뀔 때 관중석 전체를 다시 그리지 않게) */
function LiveCounter({ gameId }: { gameId: string }) {
  // 관중이 들어갔다 나와도 숫자가 이어지게 경기별로 기억
  const shown = React.useRef(liveCount(gameId));
  const [count, setCount] = React.useState(() => Math.round(shown.current * .985));
  React.useEffect(() => {
    // 나올 때마다 숫자가 올라가는 걸 보여준다
    const step = window.setInterval(() => {
      const target = liveCount(gameId);
      setCount((c) => (c === target ? c : Math.abs(target - c) < 2 ? target : Math.round(c + (target - c) * .18)));
    }, 90);
    return () => window.clearInterval(step);
  }, [gameId]);
  return (
    <div className="ka-live" aria-label={`관중 ${count.toLocaleString('ko-KR')}명`}>
      <i /> LIVE <b>{count.toLocaleString('ko-KR')}</b>명
    </div>
  );
}

export function AudienceLayer({ gameId, tension, finished }: {
  gameId: string;
  /** 0~1: 체력이 낮아지고 경기가 길어질수록 커진다 */
  tension: number;
  /** 누군가 체력 5 이하 */
  lowHp: boolean;
  finished: boolean;
}) {
  const [enabled, setEnabled] = React.useState(() => readCombatPreferences().audience);
  const [lite, setLite] = React.useState(() => { const p = readCombatPreferences(); return p.quality === 'LOW' || p.reducedMotion; });
  React.useEffect(() => {
    const changed = () => { const p = readCombatPreferences(); setEnabled(p.audience); setLite(p.quality === 'LOW' || p.reducedMotion); };
    window.addEventListener('ko-combat-preferences', changed);
    return () => window.removeEventListener('ko-combat-preferences', changed);
  }, []);

  const [small, setSmall] = React.useState(() => (typeof window === 'undefined' ? false : window.innerWidth < 700));
  React.useEffect(() => {
    const resize = () => setSmall(window.innerWidth < 700);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // 그림 미리 받아두기 (처음 튀어나올 때 빈 화면 안 보이게)
  React.useEffect(() => {
    if (!enabled) return;
    for (const n of ['crowd-cheer-back', 'crowd-cheer-front', 'crowd-calm-back', 'crowd-calm-front']) { const img = new Image(); img.src = CROWD(n); }
  }, [enabled]);

  // 튀어나오는 관중 (특정 순간에만)
  const [pop, setPop] = React.useState<{ mood: PopMood; leaving: boolean } | null>(null);
  const popTimers = React.useRef<number[]>([]);
  const popMood = React.useRef<PopMood | null>(null);
  const setTemp = React.useCallback((next: AudienceMood, ms?: number) => {
    if (next === 'idle' || next === 'tense') return;
    // 이미 나와 있으면 더 큰 반응만 덮어쓰고 시간만 늘린다
    const current = popMood.current;
    const mood = current && POP_RANK[current] > POP_RANK[next] ? current : next;
    popMood.current = mood;
    popTimers.current.forEach((t) => window.clearTimeout(t));
    setPop({ mood, leaving: false });
    const stay = ms ?? POP_MS[next];
    popTimers.current = [
      window.setTimeout(() => setPop((p) => (p ? { ...p, leaving: true } : p)), stay),
      window.setTimeout(() => { popMood.current = null; setPop(null); }, stay + 460),
    ];
  }, []);
  React.useEffect(() => () => popTimers.current.forEach((t) => window.clearTimeout(t)), []);
  // 경기 끝: 다 같이 일어나 환호
  React.useEffect(() => { if (finished && enabled) setTemp('wave', 5200); }, [finished, enabled, setTemp]);

  // 4·6. 외침과 중계 자막
  const [shouts, setShouts] = React.useState<Array<{ id: number; text: string; side: 'top' | 'bottom'; x: number }>>([]);
  const [caption, setCaption] = React.useState<{ id: number; text: string; tone: string } | null>(null);
  const captionQueue = React.useRef<Array<{ text: string; tone: string }>>([]);
  const captionBusy = React.useRef(false);
  const showNextCaption = React.useCallback(() => {
    const next = captionQueue.current.shift();
    if (!next) { captionBusy.current = false; setCaption(null); return; }
    captionBusy.current = true;
    setCaption({ id: Date.now() + Math.random(), ...next });
    window.setTimeout(showNextCaption, 2600);
  }, []);

  // 2. 웅성거림
  const murmur = React.useRef<HTMLAudioElement | null>(null);
  const swell = React.useRef(0);
  React.useEffect(() => {
    if (!enabled || finished) return;
    const audio = new Audio(SYN('crowd-murmur.wav'));
    audio.loop = true; audio.volume = 0;
    murmur.current = audio;
    const start = () => { void audio.play().catch(() => undefined); };
    start();
    window.addEventListener('pointerdown', start, { once: true });
    const hidden = () => { if (document.hidden) audio.pause(); else start(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { audio.pause(); murmur.current = null; window.removeEventListener('pointerdown', start); document.removeEventListener('visibilitychange', hidden); };
  }, [enabled, finished, gameId]);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const audio = murmur.current;
      if (!audio) return;
      swell.current = Math.max(0, swell.current - .04);
      const sfx = audioManager.getSfxVolume() / 100;
      const want = Math.min(1, (.05 + tension * .09 + swell.current * .12) * sfx);
      audio.volume = audio.volume + (want - audio.volume) * .25;
    }, 100);
    return () => window.clearInterval(id);
  }, [tension]);

  // 3. 응원 박자
  const chanting = React.useRef(false);
  const chant = React.useCallback(() => {
    if (chanting.current || !enabled) return;
    chanting.current = true;
    setTemp('chant', 3800);
    const vol = Math.round(30 * audioManager.getSfxVolume() / 100);
    [0, 1250, 2500].forEach((at) => window.setTimeout(() => {
      try { audioManager.playImpactOverlay(SYN('crowd-stomp-clap.mp3'), vol, 1); } catch { /* 소리 */ }
    }, at));
    window.setTimeout(() => { chanting.current = false; }, 4000);
  }, [enabled, setTemp]);

  // 신호 받기
  React.useEffect(() => onAudience((signal: AudienceSignal) => {
    if (!enabled || document.hidden) return;
    switch (signal.type) {
      case 'mood':
        setTemp(signal.mood, signal.ms);
        swell.current = signal.mood === 'stand' || signal.mood === 'wave' ? 1 : Math.max(swell.current, .6);
        return;
      case 'hype':
        addLive(gameId, Math.round(signal.amount * (40 + Math.random() * 60)));
        return;
      case 'shout': {
        const id = Date.now() + Math.random();
        const side = 'bottom' as const; // 관중은 아래에서만 나온다
        setShouts((list) => [...list.slice(-2), { id, text: signal.text, side, x: 8 + Math.random() * 84 }]);
        window.setTimeout(() => setShouts((list) => list.filter((s) => s.id !== id)), 1900);
        return;
      }
      case 'caption':
        if (captionQueue.current.length > 2) captionQueue.current.shift();
        captionQueue.current.push({ text: signal.text, tone: signal.tone ?? 'info' });
        if (!captionBusy.current) showNextCaption();
        return;
      case 'boo': {
        setTemp('boo');
        const vol = Math.round(30 * audioManager.getSfxVolume() / 100);
        try { audioManager.playImpactOverlay(SYN('crowd-boo.mp3'), vol, 2); } catch { /* 소리 */ }
        return;
      }
      case 'chant': chant(); return;
      case 'sweep': return; // 관중석이 상시 없으니 조명 훑기도 없음
    }
  }), [enabled, setTemp, showNextCaption, chant, gameId]);

  if (!enabled) return null;
  return (
    <div className="ka-audience" data-lite={lite} data-small={small}>
      {pop && (
        <CrowdPop mood={pop.mood} leaving={pop.leaving}>
          <LiveCounter gameId={gameId} />
        </CrowdPop>
      )}
      {shouts.map((s) => (
        <span key={s.id} className={`ka-shout ka-shout--${s.side}`} style={{ left: `${s.x}%` }} aria-hidden="true">{s.text}</span>
      ))}
      {caption && (
        <div key={caption.id} className={`ka-caption ka-caption--${caption.tone}`} role="status">
          <span className="ka-caption__tag">중계</span>
          <span className="ka-caption__text">{caption.text}</span>
        </div>
      )}
    </div>
  );
}

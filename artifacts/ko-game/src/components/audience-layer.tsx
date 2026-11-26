import React from 'react';
import { audioManager } from '../audio/audio-manager';
import { readCombatPreferences } from './combat-preferences';
import { onAudience, type AudienceMood, type AudienceSignal } from './audience-bus';
import './audience-layer.css';

/**
 * 관중 연출 (화면·소리 전용).
 * 1. 화면 위·아래 가장자리 관중석 실루엣 — 평소엔 들썩, 큰 장면엔 일어서고, 위기엔 몸을 앞으로
 * 2. 경기 내내 깔리는 웅성거림 — 긴장될수록 커짐
 * 3. 위기(체력 5 이하) 때 "쿵쿵 짝!" 응원 박자
 * 4. 관중 외침 말풍선
 * 5. 야유
 * 6. TV 중계 자막
 * 7. 관중 수(LIVE)
 * 8. 턴 시작 때 관중석 조명이 훑고 지나감
 */
const SYN = (name: string) => `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

type Person = { w: number; h: number; x: number; delay: number; dur: number; tone: number; arm: 0 | 1 | 2; phone: boolean };
function crowdRow(seed: string, count: number, scale: number): Person[] {
  const r = seeded(seed);
  return Array.from({ length: count }, () => ({
    w: (26 + r() * 14) * scale, h: (44 + r() * 18) * scale, x: (r() - .5) * 6,
    delay: -r() * 3, dur: 1.8 + r() * 1.6, tone: Math.floor(r() * 4),
    arm: r() < .28 ? (r() < .5 ? 1 : 2) : 0, phone: r() < .12,
  }));
}

const Stand = React.memo(function Stand({ side, rows, mood }: { side: 'top' | 'bottom'; rows: Person[][]; mood: AudienceMood }) {
  return (
    <div className={`ka-stand ka-stand--${side}`} data-mood={mood} aria-hidden="true">
      <span className="ka-stand__haze" />
      {rows.map((row, r) => (
        <div key={r} className={`ka-row ka-row--${r}`}>
          {row.map((p, i) => (
            <span
              key={i}
              className={`ka-person ka-tone-${p.tone}${p.arm ? ` ka-arm-${p.arm}` : ''}${p.phone ? ' ka-phone' : ''}`}
              style={{ '--w': `${p.w}px`, '--h': `${p.h}px`, '--x': `${p.x}px`, '--d': `${p.delay}s`, '--t': `${p.dur}s`, '--i': i } as React.CSSProperties}
            >
              {p.arm ? <i className="ka-arm" /> : null}
              {p.phone ? <b className="ka-phone-light" /> : null}
            </span>
          ))}
        </div>
      ))}
      <span className="ka-stand__sweep" />
      <span className="ka-stand__flashes" />
    </div>
  );
});

/** 7. 관중 수 (따로 떼어서 숫자가 바뀔 때 관중석 전체를 다시 그리지 않게) */
function LiveCounter({ gameId }: { gameId: string }) {
  const startCount = React.useMemo(() => 8000 + Math.floor(seeded(gameId)() * 7000), [gameId]);
  const [count, setCount] = React.useState(startCount);
  const target = React.useRef(startCount);
  React.useEffect(() => { target.current = startCount; setCount(startCount); }, [startCount]);
  React.useEffect(() => onAudience((signal) => {
    if (signal.type === 'hype') target.current += Math.round(signal.amount * (40 + Math.random() * 60));
  }), []);
  React.useEffect(() => {
    // 평소엔 조금씩 들어오고 나간다
    const drift = window.setInterval(() => { target.current += Math.round((Math.random() - .35) * 40); }, 2500);
    const step = window.setInterval(() => {
      setCount((c) => (c === target.current ? c : Math.abs(target.current - c) < 2 ? target.current : Math.round(c + (target.current - c) * .15)));
    }, 150);
    return () => { window.clearInterval(drift); window.clearInterval(step); };
  }, []);
  return (
    <div className="ka-live" aria-label={`관중 ${count.toLocaleString('ko-KR')}명`}>
      <i /> LIVE <b>{count.toLocaleString('ko-KR')}</b>명
    </div>
  );
}

export function AudienceLayer({ gameId, tension, lowHp, finished }: {
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

  // 관중석 (화면 너비에 맞춰 사람 수 결정)
  const [width, setWidth] = React.useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  React.useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const small = width < 700;
  const stands = React.useMemo(() => {
    const per = (w: number) => Math.ceil(width / w) + 2;
    const scale = small ? .8 : 1;
    const backN = lite ? Math.ceil(per(30 * scale) / 2) : per(30 * scale);
    const frontN = lite ? Math.ceil(per(24 * scale) / 2) : per(24 * scale);
    return {
      top: [crowdRow(`${gameId}:t0`, backN, scale * .82), crowdRow(`${gameId}:t1`, frontN, scale)],
      bottom: [crowdRow(`${gameId}:b0`, backN, scale * .82), crowdRow(`${gameId}:b1`, frontN, scale)],
    };
  }, [gameId, width, small, lite]);

  // 분위기 상태
  const base: AudienceMood = finished ? 'stand' : lowHp ? 'tense' : 'idle';
  const [mood, setMood] = React.useState<AudienceMood>(base);
  const moodTimer = React.useRef<number | null>(null);
  const baseRef = React.useRef(base);
  baseRef.current = base;
  React.useEffect(() => { if (!moodTimer.current) setMood(base); }, [base]);
  const setTemp = React.useCallback((next: AudienceMood, ms: number) => {
    if (moodTimer.current) window.clearTimeout(moodTimer.current);
    setMood(next);
    moodTimer.current = window.setTimeout(() => { moodTimer.current = null; setMood(baseRef.current); }, ms);
  }, []);

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
        setTemp(signal.mood, signal.ms ?? (signal.mood === 'stand' || signal.mood === 'wave' ? 2600 : signal.mood === 'boo' ? 2200 : 1500));
        swell.current = signal.mood === 'stand' || signal.mood === 'wave' ? 1 : Math.max(swell.current, .6);
        return;
      case 'hype':
        return; // LiveCounter가 받는다
      case 'shout': {
        const id = Date.now() + Math.random();
        const side = signal.side ?? (Math.random() < .5 ? 'top' : 'bottom');
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
        setTemp('boo', 2200);
        const vol = Math.round(30 * audioManager.getSfxVolume() / 100);
        try { audioManager.playImpactOverlay(SYN('crowd-boo.mp3'), vol, 2); } catch { /* 소리 */ }
        return;
      }
      case 'chant': chant(); return;
      case 'sweep': {
        const el = document.querySelectorAll<HTMLElement>('.ka-stand__sweep');
        el.forEach((node) => { node.classList.remove('is-on'); void node.offsetWidth; node.classList.add('is-on'); });
        return;
      }
    }
  }), [enabled, setTemp, showNextCaption, chant]);

  if (!enabled) return null;
  return (
    <div className="ka-audience" data-lite={lite} data-small={small}>
      <Stand side="top" rows={stands.top} mood={mood} />
      <Stand side="bottom" rows={stands.bottom} mood={mood} />
      <LiveCounter gameId={gameId} />
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

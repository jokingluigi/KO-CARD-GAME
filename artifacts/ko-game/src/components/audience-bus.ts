/**
 * 관중 연출 신호 (화면·소리 연출 전용 — 게임 규칙과 무관).
 * 다른 연출 코드가 "관중아, 이렇게 반응해" 하고 보내면 AudienceLayer가 받아서 보여준다.
 */
export type AudienceMood = 'idle' | 'excited' | 'stand' | 'wave' | 'tense' | 'boo' | 'chant';
export type AudienceSignal =
  | { type: 'mood'; mood: AudienceMood; ms?: number }
  | { type: 'shout'; text: string; side?: 'top' | 'bottom' }
  | { type: 'caption'; text: string; tone?: 'hype' | 'danger' | 'info' }
  | { type: 'hype'; amount: number }
  | { type: 'boo' }
  | { type: 'chant' }
  | { type: 'sweep' };

const EVENT = 'ko-audience';
export function audience(signal: AudienceSignal) {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent<AudienceSignal>(EVENT, { detail: signal })); } catch { /* 연출 */ }
}
export function onAudience(listener: (signal: AudienceSignal) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<AudienceSignal>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
export const SHOUTS = {
  big: ['우와아아!', '들어갔다!', '아프겠다…', '와 저게 들어가?!', '한 방 봤어?!', '크으으!'],
  huge: ['미쳤다!!!', '이게 맞아?!', '경기장이 흔들려!', '대박!!!'],
  ko: ['K.O.!!', '쓰러졌다!', '잘 가라~', '끝났어!'],
  dodge: ['피했다!', '오오 회피!', '어딜!'],
  heal: ['버텨!', '아직이야!', '일어나!'],
  low: ['끝내버려!', '버텨어어!', '조금만 더!', '위험해!'],
  boo: ['우우우~', '비겁해!', '우~~', '그게 뭐야!'],
  legend: ['저게 누구야?!', '와 레전드!', '오오오!'],
  finisher: ['끝이다아아!!!', '역사에 남는다!!', 'K.O.!!!'],
} as const;
export function shout(kind: keyof typeof SHOUTS, side?: 'top' | 'bottom') {
  audience({ type: 'shout', text: pick(SHOUTS[kind]), side });
}

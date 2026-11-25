import { useEffect, useRef } from 'react';
import type { GameState } from '../game/types/game-state';
import { audioManager } from '../audio/audio-manager';
import { spawnReversal, synth } from './battle-juice';

/** 화면 분위기: 18 역전 연출, 20 위기 때 북소리, 34 후반 조명 변화. 규칙과 무관한 화면·소리 전용. */
export function useBattleAtmosphere(state: GameState, enabled = true) {
  const me = state.players[0], foe = state.players[1];
  const myHealth = me?.health ?? 0, foeHealth = foe?.health ?? 0;
  const live = enabled && state.status === 'IN_PROGRESS';
  const lead = useRef<{ game: string; sign: number; turn: number } | null>(null);

  // 18. 체력 우위가 뒤집히는 순간
  useEffect(() => {
    if (!live) return;
    const sign = Math.sign(myHealth - foeHealth);
    const old = lead.current;
    lead.current = { game: state.gameId, sign: sign || old?.sign || 0, turn: state.turn };
    if (!old || old.game !== state.gameId || !sign || !old.sign || old.sign === sign) return;
    // 서로 체력이 비슷한 초반 1~2턴의 흔들림은 무시
    if (state.turn < 3 || Math.abs(myHealth - foeHealth) < 2) { lead.current.sign = old.sign; return; }
    spawnReversal(sign > 0);
  }, [live, myHealth, foeHealth, state.gameId]);

  // 20. 누구든 체력이 8 이하로 내려가면 배경음 위에 긴장감 북소리
  const tense = live && Math.min(myHealth, foeHealth) <= 8 && Math.min(myHealth, foeHealth) > 0;
  const critical = live && Math.min(myHealth, foeHealth) <= 4 && Math.min(myHealth, foeHealth) > 0;
  useEffect(() => {
    audioManager.setMusicLayer(tense ? synth('tension-drums.wav') : null, critical ? .62 : .42);
  }, [tense, critical]);
  useEffect(() => () => audioManager.setMusicLayer(null), []);

  // 34. 턴이 지날수록 테이블 조명이 좁아지고 극적으로
  const dusk = live ? Math.max(0, Math.min(1, (state.turn - 2) / 14)) : 0;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--kj-dusk', dusk.toFixed(3));
    return () => { root.style.removeProperty('--kj-dusk'); };
  }, [dusk]);
}

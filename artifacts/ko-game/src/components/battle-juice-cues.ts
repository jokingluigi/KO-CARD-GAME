import type { PresentationCue } from './presentation-feedback';
import { juiceSound, registerComboHit, spawnClashSparks, cardElement, crowdReact, fadeScorches, resetCombo, spawnChromaSplit, spawnMiss, spawnOverkill, spawnScorch, spawnShieldTing, spawnSilenceInk, spawnStatPop, spawnTableLight, spawnTurnSweep } from './battle-juice';

/** 효과 연출 신호(cue)마다 덧붙는 타격감. 전투 공격은 attack-animation 쪽에서 따로 처리한다. */
export function juiceForCue(cue: PresentationCue, lethal = false) {
  const at = { x: cue.left, y: cue.top };
  switch (cue.kind) {
    case 'DAMAGE': {
      const dmg = cue.value ?? 0;
      if (cue.overkill) spawnOverkill(cue.left, cue.top - 30, cue.overkill);
      if (cue.combat || cue.selfDamage || dmg <= 0) return;
      if (dmg >= 3) spawnTableLight(cue.left, cue.top, dmg);
      if (dmg >= 6 && cue.cardInstanceId) spawnScorch(cue.left, cue.top, dmg);
      if (dmg >= 10 || lethal) { crowdReact(2); spawnChromaSplit(lethal ? 1 : .7); }
      else if (dmg >= 6) crowdReact(1);
      return;
    }
    case 'ARMOR': case 'BLOCK': spawnShieldTing(cue.left, cue.top); return;
    case 'DODGE': spawnMiss(cue.left, cue.top - 10, cardElement(cue.cardInstanceId)); return;
    case 'BUFF': case 'DEBUFF':
      if (cue.stat === 'attack' || cue.stat === 'health' || cue.stat === 'currentHealth' || cue.stat === 'maxHealth') spawnStatPop(cue.cardInstanceId, cue.stat === 'attack' ? 'attack' : 'health', cue.value ?? (cue.kind === 'BUFF' ? 1 : -1), at);
      return;
    case 'SILENCE': spawnSilenceInk(cue.cardInstanceId, at); return;
    case 'TURN': resetCombo(); fadeScorches(); spawnTurnSweep(cue.label === 'YOUR TURN'); return;
    default: return;
  }
}

/** 전투 공격이 맞는 순간: 콤보, 반격 불꽃, 테이블 조명, 그을음, 관중, 색 갈라짐. */
export function attackJuice(animation: { damage: number; counterDamage?: number; finishingBlow?: boolean; targetKind: 'CARD' | 'CHAMPION'; geometry: { source: { top: number; height: number } } },
  contact: { x: number; y: number }, target: { left: number; top: number; width: number; height: number }) {
  const mine = animation.geometry.source.top + animation.geometry.source.height / 2 > innerHeight / 2;
  const dmg = Math.max(0, animation.damage);
  if (dmg > 0) registerComboHit(mine);
  if ((animation.counterDamage ?? 0) > 0 && animation.targetKind === 'CARD') spawnClashSparks(contact.x, contact.y, Math.max(dmg, animation.counterDamage ?? 0));
  if (dmg > 0) spawnTableLight(contact.x, contact.y, dmg);
  // 3. 큰 공격에는 '쿵' 저음을 한 겹 더
  if (dmg >= 6) juiceSound(`${import.meta.env.BASE_URL}vendor/kenney/scifi/low_frequency_explosion_000.ogg`, dmg >= 10 ? 46 : 32, 4, contact.x);
  if (dmg >= 6 && animation.targetKind === 'CARD') spawnScorch(target.left + target.width / 2, target.top + target.height / 2, dmg);
  if (animation.finishingBlow || dmg >= 10) { crowdReact(2); spawnChromaSplit(animation.finishingBlow ? 1 : .75); }
  else if (dmg >= 6) crowdReact(1);
}

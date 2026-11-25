import type { PresentationCue } from './presentation-feedback';
import { arenaQuake, arenaTail, dodgeMoment, finisherSilence, isMyChampionAt, noteTargetDamage, resetDamageStreak, spawnArmorShatter, spawnFocusLines, spawnHurtVignette, spawnKoStamp } from './hit-feel';
import { juiceSound, registerComboHit, spawnClashSparks, cardElement, crowdReact, fadeScorches, resetCombo, spawnChromaSplit, spawnMiss, spawnOverkill, spawnScorch, spawnShieldTing, spawnSilenceInk, spawnStatPop, spawnTableLight, spawnTurnSweep } from './battle-juice';

/** 효과 연출 신호(cue)마다 덧붙는 타격감. 전투 공격은 attack-animation 쪽에서 따로 처리한다. */
export function juiceForCue(cue: PresentationCue, lethal = false) {
  const at = { x: cue.left, y: cue.top };
  switch (cue.kind) {
    case 'DAMAGE': {
      const dmg = cue.value ?? 0;
      if (cue.overkill) spawnOverkill(cue.left, cue.top - 30, cue.overkill);
      if (cue.combat || cue.selfDamage || dmg <= 0) return;
      // ── 타격감 2차 (효과 피해)
      spawnFocusLines(cue.left, cue.top, lethal ? 10 : dmg);
      arenaTail(dmg, cue.left, lethal);
      arenaQuake(dmg, lethal);
      if (!cue.cardInstanceId && isMyChampionAt(cue.left, cue.top)) spawnHurtVignette(dmg);
      noteTargetDamage(cue.cardInstanceId ?? (cue.playerId ? `champion:${cue.playerId}` : undefined), dmg, cue.left, cue.top);
      if (dmg >= 3) spawnTableLight(cue.left, cue.top, dmg);
      if (dmg >= 6 && cue.cardInstanceId) spawnScorch(cue.left, cue.top, dmg);
      if (lethal) { finisherSilence(() => crowdReact(2)); spawnChromaSplit(1); }
      else if (dmg >= 10) { crowdReact(2); spawnChromaSplit(.7); }
      else if (dmg >= 6) crowdReact(1);
      return;
    }
    // 9. 아머가 피해를 일부만 줄이고 뚫리면 '깨짐', 완전히 막으면 '팅'
    case 'ARMOR': if ((cue.value ?? 0) > 0) spawnArmorShatter(cue.left, cue.top); else spawnShieldTing(cue.left, cue.top); return;
    case 'BLOCK': spawnShieldTing(cue.left, cue.top); return;
    case 'DODGE': spawnMiss(cue.left, cue.top - 10, cardElement(cue.cardInstanceId)); dodgeMoment(cardElement(cue.cardInstanceId)); return;
    case 'BUFF': case 'DEBUFF':
      if (cue.stat === 'attack' || cue.stat === 'health' || cue.stat === 'currentHealth' || cue.stat === 'maxHealth') spawnStatPop(cue.cardInstanceId, cue.stat === 'attack' ? 'attack' : 'health', cue.value ?? (cue.kind === 'BUFF' ? 1 : -1), at);
      return;
    case 'SILENCE': spawnSilenceInk(cue.cardInstanceId, at); return;
    case 'TURN': resetCombo(); resetDamageStreak(); fadeScorches(); spawnTurnSweep(cue.label === 'YOUR TURN'); return;
    default: return;
  }
}

/** 전투 공격이 맞는 순간: 콤보, 반격 불꽃, 테이블 조명, 그을음, 관중, 색 갈라짐. */
export function attackJuice(animation: { damage: number; counterDamage?: number; finishingBlow?: boolean; targetKind: 'CARD' | 'CHAMPION'; geometry: { source: { top: number; height: number; left?: number; width?: number } };
    target?: { instanceId: string; currentHealth: number } | null; attacker?: { instanceId: string; currentHealth: number }; targetPlayerId?: string },
  contact: { x: number; y: number }, target: { left: number; top: number; width: number; height: number }) {
  const mine = animation.geometry.source.top + animation.geometry.source.height / 2 > innerHeight / 2;
  const dmg = Math.max(0, animation.damage);
  if (dmg > 0) registerComboHit(mine);
  if ((animation.counterDamage ?? 0) > 0 && animation.targetKind === 'CARD') spawnClashSparks(contact.x, contact.y, Math.max(dmg, animation.counterDamage ?? 0));
  if (dmg > 0) spawnTableLight(contact.x, contact.y, dmg);
  // 3. 큰 공격에는 '쿵' 저음을 한 겹 더
  if (dmg >= 6) juiceSound(`${import.meta.env.BASE_URL}vendor/kenney/scifi/low_frequency_explosion_000.ogg`, dmg >= 10 ? 46 : 32, 4, contact.x);
  if (dmg >= 6 && animation.targetKind === 'CARD') spawnScorch(target.left + target.width / 2, target.top + target.height / 2, dmg);
  // 3차 7. 결정타는 맞은 직후 0.4초 정적 → 함성
  if (animation.finishingBlow) { finisherSilence(() => crowdReact(2)); spawnChromaSplit(1); }
  else if (dmg >= 10) { crowdReact(2); spawnChromaSplit(.75); }
  else if (dmg >= 6) crowdReact(1);
  // ── 타격감 2차
  const cx = target.left + target.width / 2, cy = target.top + target.height / 2;
  spawnFocusLines(contact.x, contact.y, animation.finishingBlow ? 10 : dmg);                       // 4
  arenaTail(dmg, contact.x, Boolean(animation.finishingBlow));                                      // 10
  arenaQuake(dmg, Boolean(animation.finishingBlow));                                                 // 3차 3
  if (animation.targetKind === 'CHAMPION' && isMyChampionAt(cx, cy)) spawnHurtVignette(dmg);      // 5
  noteTargetDamage(animation.target?.instanceId ?? (animation.targetKind === 'CHAMPION' ? `champion:${animation.targetPlayerId ?? (isMyChampionAt(cx, cy) ? 'me' : 'foe')}` : undefined), dmg, cx, cy); // 12
  if (animation.targetKind === 'CARD' && animation.target && dmg > 0 && dmg >= animation.target.currentHealth) window.setTimeout(() => spawnKoStamp(cx, cy + target.height * .24), 110); // 6 (피해 숫자 아래)
  const src = animation.geometry.source;
  if ((animation.counterDamage ?? 0) > 0 && animation.attacker && (animation.counterDamage ?? 0) >= animation.attacker.currentHealth && src.left !== undefined && src.width !== undefined)
    window.setTimeout(() => spawnKoStamp(src.left! + src.width! / 2, src.top + src.height * .74), 220);
}

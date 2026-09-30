import type { BossSlot, RunPhase, Scene, Season, TowerMusicTrack } from '../../../../lib/game-engine/src/tower/types';

export function towerMusicFor(phase: RunPhase | undefined, slot: BossSlot | undefined, music: Season['music'], scene?: Scene): TowerMusicTrack | undefined {
  if (phase === 'DIALOGUE') return scene?.music;
  if (phase !== 'BATTLE') return undefined;
  return music?.[slot === 'hiddenBoss' ? 'hiddenBoss' : slot === 'finalBoss' ? 'boss' : slot ? 'midBoss' : 'normal'];
}

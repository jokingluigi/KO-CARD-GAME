import { finisherDamage } from './finisher-scale';
/** Pure numbers for card-physics.ts (kept separate so they can be tested without the DOM). */
export type PhysicsTarget = { pitch: number; yaw: number; roll: number };

/** Angular kick (deg/ms) for a card hit by a blow travelling (dx, dy) with this much force. */
export function hitImpulse(dx: number, dy: number, force: number): PhysicsTarget {
  const length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
  const f = Math.max(0, Number.isFinite(force) ? force : 0);
  // The struck edge is shoved away; sideways blows also spin the card a little.
  return { pitch: uy * f, yaw: ux * f, roll: ux * f * .45 };
}

/** Kick strength of the struck card per damage tier: a poke barely rocks it, a finisher throws it. */
export function hitForce(damage: number, finisher = false): number {
  const scaled = finisherDamage(damage, finisher), amount = scaled.damage;
  if (amount <= 0) return 0;
  // Only a slight tip: the board hop and screen shake carry the big hits.
  if (scaled.top) return .34;
  return amount >= 10 ? .28 : amount >= 6 ? .22 : amount >= 3 ? .16 : .11;
}

/** Board cards rock longer and looser than a held card: ~3 visible swings before settling. */
export const BOARD_SPRING = { stiffness: .0006, damping: .011 } as const;

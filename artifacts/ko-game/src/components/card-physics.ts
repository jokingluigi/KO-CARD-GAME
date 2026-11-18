import { createSwing, stepSwing, swingAtRest, type SwingState } from './card-swing-physics';
import { prefersReducedMotion } from './presentation-config';
import { BOARD_SPRING, hitImpulse, type PhysicsTarget } from './card-physics-model';
export { hitForce } from './card-physics-model';
import './card-physics.css';

/**
 * Presentation-only spring physics for cards resting on the battle board and in hand.
 * A struck card is a little body on damped springs (pitch / yaw / roll): the hit
 * kicks it so it tips slightly and rocks back to rest.
 * Rotation is written to the `--ko-phys` custom property, so it never fights the
 * `translate` / `rotate` properties other presentation code already animates.
 */

type Target = PhysicsTarget;
type Body = { el: HTMLElement; swing: SwingState; target: Target };

const ZERO: Target = { pitch: 0, yaw: 0, roll: 0 };
const CARD_SELECTOR = '.ko-game-stage .ko-card-depth';

const bodies = new Map<HTMLElement, Body>();
let frame = 0;
let last = 0;

function body(el: HTMLElement): Body {
  let entry = bodies.get(el);
  if (!entry) {
    entry = { el, swing: createSwing(), target: { ...ZERO } };
    bodies.set(el, entry);
  }
  return entry;
}

function render(entry: Body) {
  const { pitch, yaw, roll } = entry.swing;
  entry.el.style.setProperty(
    '--ko-phys',
    `perspective(600px) rotateX(${(-pitch.angle).toFixed(2)}deg) rotateY(${yaw.angle.toFixed(2)}deg) rotate(${(-roll.angle).toFixed(2)}deg)`,
  );
}

function tick() {
  const now = performance.now();
  const dt = Math.min(40, now - last);
  last = now;
  for (const entry of bodies.values()) {
    if (!entry.el.isConnected) { bodies.delete(entry.el); continue; }
    entry.swing = stepSwing(entry.swing, entry.target, dt, BOARD_SPRING);
    const resting = entry.target.pitch === 0 && entry.target.yaw === 0 && entry.target.roll === 0 && swingAtRest(entry.swing);
    if (resting) {
      entry.el.style.removeProperty('--ko-phys');
      bodies.delete(entry.el);
    } else render(entry);
  }
  frame = bodies.size ? requestAnimationFrame(tick) : 0;
}

function wake() {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(tick);
}



export function kickCard(el: HTMLElement, impulse: Target) {
  if (prefersReducedMotion()) return;
  const entry = body(el);
  entry.swing.pitch.velocity += impulse.pitch;
  entry.swing.yaw.velocity += impulse.yaw;
  entry.swing.roll.velocity += impulse.roll;
  wake();
}

/**
 * Kick the card nearest (x, y) hard and every other board card by distance.
 * `force` is the struck card's kick; neighbours fall off quickly with distance.
 */
export function kickBoard(x: number, y: number, dx: number, dy: number, force: number, struckMode: 'all' | 'skip' | 'only' = 'all', root: ParentNode = document) {
  if (prefersReducedMotion() || !(force > 0)) return;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}`))) {
    if (!el.closest('.ko-board-slot-wrapper')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const distance = Math.hypot(cx - x, cy - y);
    const struck = distance < Math.max(r.width, r.height) * .5;
    // Neighbours are pushed away from the hit, not along the blow.
    const away = struck ? { x: dx, y: dy } : { x: cx - x, y: cy - y };
    if ((struckMode === 'skip' && struck) || (struckMode === 'only' && !struck)) continue;
    const falloff = struck ? 1 : Math.max(0, .45 * (1 - distance / 520));
    if (falloff > .02) kickCard(el, hitImpulse(away.x, away.y, force * falloff));
  }
}

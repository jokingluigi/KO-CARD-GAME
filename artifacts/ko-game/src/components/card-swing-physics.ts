/**
 * Presentation-only spring physics for a card held by the pointer.
 * The card hangs from the grab point: moving it makes it lean in 3D against the
 * motion (like dragging it through air), and when the pointer stops the springs
 * overshoot, wobble a couple of times and settle flat.
 */
export type SwingAxis = { angle: number; velocity: number };
export type SwingState = { pitch: SwingAxis; yaw: SwingAxis; roll: SwingAxis };

export const SWING_LIMITS = { pitch: 26, yaw: 26, roll: 12 } as const;

export function createSwing(): SwingState {
  return { pitch: { angle: 0, velocity: 0 }, yaw: { angle: 0, velocity: 0 }, roll: { angle: 0, velocity: 0 } };
}

/** Lean targets (degrees) from pointer velocity in px/ms. */
export function swingTarget(vx: number, vy: number) {
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));
  return {
    // Moving up tips the top edge away; moving sideways turns the card into the motion.
    pitch: clamp(vy * 16, SWING_LIMITS.pitch),
    yaw: clamp(vx * 16, SWING_LIMITS.yaw),
    // Hanging from the grab point, sideways motion swings the bottom back like a pendulum.
    roll: clamp(vx * 7, SWING_LIMITS.roll),
  };
}

/**
 * Advance the damped springs by dt milliseconds toward the targets.
 * Under-damped on purpose so a sudden stop gives a visible wobble.
 */
export function stepSwing(state: SwingState, target: { pitch: number; yaw: number; roll: number }, dt: number, spring: { stiffness: number; damping: number } = { stiffness: .00075, damping: .03 }): SwingState {
  const step = Math.max(0, Math.min(40, Number.isFinite(dt) ? dt : 0));
  const { stiffness, damping } = spring;
  const advance = (axis: SwingAxis, goal: number, limit: number): SwingAxis => {
    let { angle, velocity } = axis;
    // Sub-steps keep the spring stable on slow frames.
    for (let left = step; left > 0; left -= 8) {
      const h = Math.min(8, left);
      velocity += ((goal - angle) * stiffness - velocity * damping) * h;
      angle += velocity * h;
    }
    angle = Math.max(-limit * 1.4, Math.min(limit * 1.4, angle));
    return { angle, velocity };
  };
  return {
    pitch: advance(state.pitch, target.pitch, SWING_LIMITS.pitch),
    yaw: advance(state.yaw, target.yaw, SWING_LIMITS.yaw),
    roll: advance(state.roll, target.roll, SWING_LIMITS.roll),
  };
}

export function swingAtRest(state: SwingState) {
  return [state.pitch, state.yaw, state.roll].every(axis => Math.abs(axis.angle) < .05 && Math.abs(axis.velocity) < .0005);
}

/** CSS transform tail for the current swing; the shadow slides opposite the lean. */
export function swingTransform(state: SwingState) {
  const f = (n: number) => n.toFixed(2);
  return {
    transform: `perspective(900px) rotateX(${f(-state.pitch.angle)}deg) rotateY(${f(state.yaw.angle)}deg) rotate(${f(-state.roll.angle)}deg)`,
    shadowX: -state.yaw.angle * .6,
    shadowY: state.pitch.angle * .4,
  };
}

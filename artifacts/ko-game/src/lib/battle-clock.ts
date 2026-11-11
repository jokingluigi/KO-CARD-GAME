/** Server-adjusted deadlines; animation time never controls the turn clock. */
export function secondsUntil(
  deadline: number | null | undefined,
  offset: number,
  now: number,
  fallback = 90,
) {
  return deadline == null
    ? fallback
    : Math.max(0, Math.ceil((deadline - now - offset) / 1000));
}

export function nextSecondDelay(deadline: number, offset: number, now: number) {
  const remaining = deadline - now - offset;
  return remaining <= 0 ? null : Math.max(16, (remaining % 1000 || 1000) + 1);
}

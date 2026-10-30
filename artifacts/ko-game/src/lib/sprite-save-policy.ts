import { parseBattleSprite } from "@workspace/cosmetics";
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
/** Compare normalized server-visible settings, never infer success from a timeout. */
export function sameSavedSprite(a: unknown, b: unknown) {
  if (a === null || b === null) return a === b;
  const x = parseBattleSprite(a),
    y = parseBattleSprite(b);
  return (
    !!x && !!y && JSON.stringify(canonical(x)) === JSON.stringify(canonical(y))
  );
}

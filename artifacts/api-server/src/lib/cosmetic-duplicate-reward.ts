export const COSMETIC_DUPLICATE_DEFAULTS = {
  IMAGE_EMOTE: 50,
  SKIN: 100,
  CHAMPION_SKIN: 200,
} as const;
export function cosmeticDuplicateReward(
  type: keyof typeof COSMETIC_DUPLICATE_DEFAULTS,
  env: NodeJS.ProcessEnv = process.env,
) {
  const text = env["COSMETIC_DUPLICATE_" + type];
  if (text === undefined) return COSMETIC_DUPLICATE_DEFAULTS[type];
  const value = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 100000
  )
    throw Error("Invalid cosmetic duplicate reward configuration: " + type);
  return value;
}

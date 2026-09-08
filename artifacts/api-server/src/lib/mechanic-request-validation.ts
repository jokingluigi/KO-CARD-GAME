/**
 * Future registry names describe capabilities, never a specific card.
 * This deliberately conservative rule leaves ambiguous suggestions unset.
 */
export function isGenericMechanicEffectName(
  value: string,
  originalCardText = "",
): boolean {
  const name = value.trim();
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(name) || name.length > 80) {
    return false;
  }

  const words = name.split("_");
  const genericWords = new Set([
    "ADD", "ALL", "AREA", "CARD", "CHARACTER", "CONTROL", "DAMAGE",
    "DELAY", "EFFECT", "EXCHANGE", "FIELD", "HAND", "MATCH", "MOVE",
    "RANDOM", "REORDER", "RESET", "REWIND", "SHUFFLE", "STOP", "SWAP",
    "TIME", "TURN", "ZONE",
  ]);
  // Proper-name-like all-word identifiers (e.g. THE_ROCK_SLAM) are not
  // dependable capability names. Require at least one mechanics vocabulary word.
  if (!words.some((word) => genericWords.has(word))) return false;

  const cardTitleTokens = originalCardText.match(/[A-Za-z0-9]{4,}/g) ?? [];
  return !cardTitleTokens.some((token) => words.includes(token.toUpperCase()));
}
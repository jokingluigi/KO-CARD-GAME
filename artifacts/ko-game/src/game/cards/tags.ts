/**
 * Canonical card-tag comparison. Persisted/admin data is validated elsewhere,
 * but runtime snapshots may still contain legacy missing or empty values.
 */
export function canonicalCardTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function sharesCardTag(
  cardA: { tags?: readonly string[] | null },
  cardB: { tags?: readonly string[] | null },
): boolean {
  const tagsA = new Set(canonicalCardTags(cardA.tags));
  return canonicalCardTags(cardB.tags).some((tag) => tagsA.has(tag));
}
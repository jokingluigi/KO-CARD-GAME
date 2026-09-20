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

export type CardTagFilter = {
  tagsAny?: readonly string[];
  tagsAll?: readonly string[];
  tagsNone?: readonly string[];
};

export function hasCardTag(
  card: { tags?: readonly string[] | null },
  tag: string,
): boolean {
  return canonicalCardTags(card.tags).includes(tag.trim());
}

export function matchesCardTagFilter(
  card: { tags?: readonly string[] | null },
  filter: CardTagFilter | null | undefined,
): boolean {
  if (!filter) return true;
  const tags = new Set(canonicalCardTags(card.tags));
  if (filter.tagsAny && !filter.tagsAny.some((tag) => tags.has(tag.trim()))) return false;
  if (filter.tagsAll && !filter.tagsAll.every((tag) => tags.has(tag.trim()))) return false;
  if (filter.tagsNone?.some((tag) => tags.has(tag.trim()))) return false;
  return true;
}

export function sharesCardTag(
  cardA: { tags?: readonly string[] | null },
  cardB: { tags?: readonly string[] | null },
): boolean {
  const tagsA = new Set(canonicalCardTags(cardA.tags));
  return canonicalCardTags(cardB.tags).some((tag) => tagsA.has(tag));
}
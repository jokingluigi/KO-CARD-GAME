/**
 * Canonical card-tag comparison. Persisted/admin data is validated elsewhere,
 * but runtime snapshots may still contain legacy missing or empty values.
 */
export function canonicalCardTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.normalize('NFC').replace(/\s+/gu, ' ').trim())
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
  return canonicalCardTags(card.tags).includes(canonicalCardTags([tag])[0] ?? '');
}

export function matchesCardTagFilter(
  card: { tags?: readonly string[] | null },
  filter: CardTagFilter | null | undefined,
): boolean {
  if (!filter) return true;
  const tags = new Set(canonicalCardTags(card.tags));
  const any = filter.tagsAny?.map((tag) => canonicalCardTags([tag])[0] ?? '');
  const all = filter.tagsAll?.map((tag) => canonicalCardTags([tag])[0] ?? '');
  const none = filter.tagsNone?.map((tag) => canonicalCardTags([tag])[0] ?? '');
  if (any && !any.some((tag) => tags.has(tag))) return false;
  if (all && !all.every((tag) => tags.has(tag))) return false;
  if (none?.some((tag) => tags.has(tag))) return false;
  return true;
}

export function sharesCardTag(
  cardA: { tags?: readonly string[] | null },
  cardB: { tags?: readonly string[] | null },
): boolean {
  const tagsA = new Set(canonicalCardTags(cardA.tags));
  return canonicalCardTags(cardB.tags).some((tag) => tagsA.has(tag));
}
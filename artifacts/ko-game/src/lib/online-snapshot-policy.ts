/** Replayed acknowledgements may confirm a request, but must never rewind a newer state. */
export function acceptsSnapshotVersion(
  current: number | null,
  incoming: number,
) {
  return (
    Number.isSafeInteger(incoming) &&
    incoming >= 0 &&
    (current === null || incoming >= current)
  );
}

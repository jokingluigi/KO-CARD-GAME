/** Compare the persisted fields only; upload receipts and editor-only fields are not champion data. */
export function championSaveValuesMatch(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): boolean {
  if (
    typeof actual.id !== "string" ||
    !Number.isInteger(actual.version) ||
    Number(actual.version) < 1
  )
    return false;
  const input = { ...expected };
  for (const [asset, url] of [
    ["imageAssetId", "imageUrl"],
    ["questCompletedPortraitAssetId", "questCompletedPortraitUrl"],
    ["questCompleteAudioAssetId", "questCompleteAudioUrl"],
  ]) {
    if (
      typeof input[asset] === "string" &&
      (input[asset] as string).startsWith("/objects/uploads/")
    )
      input[url] = "/api/storage" + input[asset];
    else if (
      typeof input[url] === "string" &&
      (input[url] as string).startsWith("/api/storage/objects/")
    )
      input[asset] = (input[url] as string).slice("/api/storage".length);
  }
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  const keys = Object.keys(input).filter(
    (k) =>
      !["id", "version", "createdAt", "updatedAt"].includes(k) &&
      Object.hasOwn(actual, k),
  );
  return (
    keys.includes("name") &&
    keys.every((k) => {
      const a = input[k],
        b = actual[k];
      if (typeof a === "string" && typeof b === "string") return a === b;
      if ((a == null || a === "") && (b == null || b === "")) return true;
      if (
        ["imageScale", "imagePositionX", "imagePositionY"].includes(k) &&
        typeof a === "number" &&
        typeof b === "number"
      )
        return Math.abs(a - b) < 0.0001;
      return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    })
  );
}

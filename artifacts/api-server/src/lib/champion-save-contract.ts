export type ChampionSaveResult =
  | { ok: true; version: number }
  | { ok: false; status: 409; field: "version" };

/** Pure CAS policy used by the Champion PATCH route and fixture tests. */
export function compareAndAdvanceChampionVersion(
  currentVersion: number,
  expectedVersion: number,
): ChampionSaveResult {
  return currentVersion === expectedVersion
    ? { ok: true, version: currentVersion + 1 }
    : { ok: false, status: 409, field: "version" };
}
import { useEffect, useSyncExternalStore } from "react";
let labels: Record<string, string> = {},
  pending: Promise<void> | null = null,
  loadedAt = 0;
const listeners = new Set<() => void>();
export function updateTagLabels(value: Record<string, string>) {
  labels = Object.fromEntries(
    Object.entries(value).filter(
      ([key, label]) => key && typeof label === "string" && label.trim(),
    ),
  );
  loadedAt = Date.now();
  listeners.forEach((fn) => fn());
}
async function load() {
  if (pending || Date.now() - loadedAt < 60000) return;
  pending = fetch(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/card-tags`,
    { cache: "no-store" },
  )
    .then(async (r) => {
      if (r.ok) {
        const body = await r.json();
        if (
          body.labels &&
          typeof body.labels === "object" &&
          !Array.isArray(body.labels)
        )
          updateTagLabels(body.labels);
      }
    })
    .catch(() => {})
    .finally(() => {
      pending = null;
    });
  return pending;
}
function refresh() {
  void load();
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    }
  };
}
export function useTagLabels() {
  useEffect(refresh, []);
  return useSyncExternalStore(
    subscribe,
    () => labels,
    () => labels,
  );
}
export function tagLabel(tag: string, catalog: Record<string, string>) {
  return Object.hasOwn(catalog, tag) ? catalog[tag] : tag;
}
/** Only explicit tag references change; card names retain their stable names. */
export function displayTagReferences(
  text: string,
  catalog: Record<string, string>,
): string {
  for (const [key, label] of Object.entries(catalog)) {
    if (key === label) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`(['‘“"])${escaped}(['’”"])(?=\\s*태그)`, "gu"),
      (_match, left: string, right: string) => left + label + right,
    );
  }
  return text;
}

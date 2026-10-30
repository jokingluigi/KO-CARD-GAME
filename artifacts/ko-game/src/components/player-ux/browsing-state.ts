import { useEffect, useState } from "react";
/** Session-only browsing controls; never stores inventory or ownership. */
export function useBrowsingState<T>(
  key: string,
  initial: T,
  accept: (v: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = JSON.parse(
        sessionStorage.getItem("ko-browse:" + key) ?? "null",
      );
      return accept(v) ? (v as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("ko-browse:" + key, JSON.stringify(value));
    } catch {
      /* Browsing remains available without storage. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
export function validCatalogView(v: unknown) {
  const x = v as Record<string, unknown> | null;
  return (
    !!x &&
    ["ALL", "OWNED", "UNOWNED"].includes(String(x.ownership)) &&
    ["ALL", "NORMAL", "EPIC", "LEGENDARY"].includes(String(x.rarity)) &&
    typeof x.tag === "string" &&
    x.tag.length < 200 &&
    typeof x.cost === "string" &&
    (x.cost === "ALL" || /^\d{1,2}$/.test(x.cost))
  );
}

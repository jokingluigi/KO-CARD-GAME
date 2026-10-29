import { useEffect, useState } from "react";
import {
  fetchCurrentUser,
  SESSION_CHANGED_EVENT,
  type AuthResponse,
} from "../../lib/auth-client";
export type Wish = {
  id: string;
  kind: "card" | "skin";
  name: string;
  image?: string | null;
  acquired?: boolean;
};
export type MatchEntry = {
  mode?: "AI" | "QUICK" | "FRIENDLY" | "OTHER";
  id: string;
  deckId?: string;
  deckName?: string;
  opponent: string;
  result: "승리" | "패배" | "무승부";
  at: number;
};
export type Launch = { id: string; name: string; mode: "QUICK" | "FRIENDLY" };
export type Shelf = {
  launches?: Record<string, Launch>;
  wishes: Wish[];
  matches: MatchEntry[];
};
export const emptyShelf = (): Shelf => ({ wishes: [], matches: [] });
export function readShelf(id: string): Shelf {
  try {
    const v = JSON.parse(
      localStorage.getItem("ko-player-shelf:" + id) ?? "null",
    );
    return {
      launches: v?.launches && typeof v.launches === "object" ? v.launches : {},
      wishes: Array.isArray(v?.wishes)
        ? v.wishes
            .filter((x: Wish) => x && typeof x.id === "string")
            .slice(0, 500)
        : [],
      matches: Array.isArray(v?.matches)
        ? v.matches
            .filter((x: MatchEntry) => x && typeof x.id === "string")
            .slice(0, 200)
        : [],
    };
  } catch {
    return emptyShelf();
  }
}
export function changeShelf(id: string, update: (s: Shelf) => Shelf) {
  try {
    localStorage.setItem(
      "ko-player-shelf:" + id,
      JSON.stringify(update(readShelf(id))),
    );
    window.dispatchEvent(new Event("ko-player-shelf"));
    return true;
  } catch {
    return false;
  }
}
export function useShelf() {
  const [id, setId] = useState<string | null>(null),
    [data, setData] = useState(emptyShelf),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const changed = (e: Event) => {
      const next = (e as CustomEvent<AuthResponse>).detail?.user?.id ?? null;
      setId(next);
      setData(next ? readShelf(next) : emptyShelf());
    };
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    void fetchCurrentUser()
      .then((r) => {
        if (live) setId(r.user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, changed);
    };
  }, []);
  useEffect(() => {
    const refresh = () => setData(id ? readShelf(id) : emptyShelf());
    refresh();
    window.addEventListener("ko-player-shelf", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ko-player-shelf", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [id]);
  return {
    id,
    data,
    error,
    update: (fn: (s: Shelf) => Shelf) => {
      if (id && !changeShelf(id, fn))
        setError(
          "이 브라우저에 저장하지 못했어요. 저장 공간과 개인정보 보호 설정을 확인하세요.",
        );
    },
  };
}

export async function rememberMatchDeck(matchId: string, deck: Launch) {
  try {
    const r = await fetchCurrentUser();
    if (r.user)
      changeShelf(r.user.id, (s) => ({
        ...s,
        launches: Object.fromEntries(
          [...Object.entries(s.launches ?? {}), [matchId, deck]].slice(-100),
        ),
      }));
  } catch {
    /* optional local history cannot block matching */
  }
}

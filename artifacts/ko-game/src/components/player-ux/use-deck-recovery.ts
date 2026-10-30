import { useEffect, useRef, useState } from "react";
import { draftKey, readDeckDraft, type DeckDraft } from "./policy";
/** One recoverable, account-scoped draft. Never saves to the deck API implicitly. */
export function useDeckRecovery(
  user: string | undefined,
  ready: boolean,
  draft: DeckDraft,
  dirty: boolean,
) {
  const [recovery, setRecovery] = useState<DeckDraft | null>(null),
    [loaded, setLoaded] = useState<string | null>(null),
    [stored, setStored] = useState(false),
    [error, setError] = useState(false);
  const current = useRef({ dirty, draft, user });
  current.current = { dirty, draft, user };
  useEffect(() => {
    if (!ready || !user) return;
    try {
      setRecovery(readDeckDraft(localStorage.getItem(draftKey(user))));
    } catch {
      setError(true);
    }
    setLoaded(user);
    setStored(false);
  }, [ready, user]);
  useEffect(() => {
    if (!ready || !user || loaded !== user || recovery || !dirty) return;
    try {
      localStorage.setItem(draftKey(user), JSON.stringify(draft));
      setStored(true);
      setError(false);
    } catch {
      setStored(false);
      setError(true);
    }
  }, [
    ready,
    user,
    loaded,
    recovery,
    dirty,
    draft.editingId,
    draft.name,
    draft.championId,
    draft.cards.join("\0"),
  ]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (current.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const link = (e: MouseEvent) => {
      if (
        !current.current.dirty ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element)?.closest?.("a[href]");
      if (
        !a ||
        a.hasAttribute("download") ||
        a.getAttribute("target") === "_blank"
      )
        return;
      const url = new URL(a.getAttribute("href")!, location.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      if (
        !window.confirm("저장하지 않은 덱 변경이 있어요. 이 화면을 나갈까요?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", link, true);
    };
  }, []);
  const discard = () => {
    if (user)
      try {
        localStorage.removeItem(draftKey(user));
      } catch {
        setError(true);
      }
    setRecovery(null);
    setStored(false);
  };
  return {
    recovery: loaded === user ? recovery : null,
    discard,
    stored,
    error,
    acknowledge: () => setRecovery(null),
  };
}

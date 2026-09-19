import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Check, CircleAlert, Crown, LockKeyhole, Radio, Shield, Swords } from "lucide-react";
import { useLocation } from "wouter";
import { fetchCurrentUser, type AuthUser } from "@/lib/auth-client";
import { fetchDecks, type Deck } from "@/lib/decks-client";
import { ROUTES } from "@/lib/routes";
import { deckValidityLabel } from "@/lib/display-labels";

export type OnlineAuthState =
  | { status: "loading"; user: null }
  | { status: "ready"; user: AuthUser }
  | { status: "error"; user: null; message: string };

export function useOnlineAuth() {
  const [auth, setAuth] = useState<OnlineAuthState>({ status: "loading", user: null });
  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((response) => {
        if (!active) return;
        setAuth(response.authenticated && response.user
          ? { status: "ready", user: response.user }
          : { status: "error", user: null, message: "온라인 대전은 로그인 후 이용할 수 있습니다." });
      })
      .catch((error) => {
        if (active) setAuth({ status: "error", user: null, message: error instanceof Error ? error.message : "로그인 상태를 확인하지 못했습니다." });
      });
    return () => {
      active = false;
    };
  }, []);
  return auth;
}

export function OnlineShell({
  eyebrow,
  title,
  description,
  children,
  backHref = ROUTES.ONLINE,
  status,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  status?: ReactNode;
}) {
  const [, navigate] = useLocation();
  return (
    <main className="ko-online-shell relative overflow-hidden px-5 py-6 text-white sm:px-8 sm:py-10">
      <div className="ko-online-grid pointer-events-none absolute inset-0 opacity-80" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex items-start justify-between gap-4">
          <button
            type="button"
            data-testid="button-online-back"
            onClick={() => navigate(backHref)}
            className="ko-online-action inline-flex items-center gap-2 rounded border border-neutral-800 bg-black/30 px-3 py-2 text-xs font-black text-neutral-400 hover:border-amber-500/70 hover:text-amber-200"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            뒤로
          </button>
          <div className="text-right">
            <div className="font-display text-[0.68rem] font-black tracking-[0.42em] text-amber-400">KO / ONLINE</div>
            {status}
          </div>
        </header>
        <section className="mt-12 max-w-2xl sm:mt-16">
          <p className="font-display text-xs font-bold tracking-[0.34em] text-amber-500">{eyebrow}</p>
          <h1 className="mt-3 font-display text-5xl font-black tracking-tight text-white sm:text-7xl">{title}</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-400 sm:text-base">{description}</p>
        </section>
        <div className="mt-10 flex-1 pb-8 sm:mt-14">{children}</div>
        <footer className="border-t border-neutral-900 py-5 text-[0.65rem] font-bold tracking-[0.12em] text-neutral-600">
          SERVER-AUTHORITATIVE MATCHES · PRIVATE BY DEFAULT
        </footer>
      </div>
    </main>
  );
}

export function OnlineAuthGate({ children }: { children: (user: AuthUser) => ReactNode }) {
  const auth = useOnlineAuth();
  const [, navigate] = useLocation();
  if (auth.status === "loading") {
    return (
      <main className="ko-online-shell flex min-h-[100dvh] items-center justify-center p-6">
        <section className="ko-online-panel w-full max-w-md rounded-xl p-8" data-testid="status-online-auth-loading">
          <div className="h-2 w-24 animate-pulse rounded bg-amber-400/40" />
          <div className="mt-5 h-8 w-56 animate-pulse rounded bg-neutral-800" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-neutral-900" />
        </section>
      </main>
    );
  }
  if (auth.status === "error") {
    return (
      <main className="ko-online-shell flex min-h-[100dvh] items-center justify-center p-6">
        <section className="ko-online-panel w-full max-w-md rounded-xl p-8 text-center">
          <CircleAlert className="mx-auto h-8 w-8 text-amber-400" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-black text-white">온라인 대전을 열 수 없습니다</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400" data-testid="status-online-auth-error">{auth.message}</p>
          <button
            type="button"
            data-testid="button-online-auth-back"
            onClick={() => navigate(ROUTES.MAIN_MENU)}
            className="ko-online-action mt-7 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300"
          >
            메인 메뉴로
          </button>
        </section>
      </main>
    );
  }
  return <>{children(auth.user)}</>;
}

export function useOnlineDecks() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetchDecks()
      .then((value) => active && setDecks(value))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "덱을 불러오지 못했습니다."));
    return () => {
      active = false;
    };
  }, []);
  return { decks, error };
}

export function DeckPicker({
  decks,
  selectedDeckId,
  onSelect,
}: {
  decks: Deck[];
  selectedDeckId: string | null;
  onSelect: (deckId: string) => void;
}) {
  const validDecks = useMemo(() => decks.filter((deck) => deck.isValid), [decks]);
  return (
    <section aria-label="온라인 덱 선택" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-black tracking-[0.2em] text-amber-400">01 / CHOOSE YOUR DECK</p>
          <h2 className="mt-2 text-xl font-black text-white">유효한 덱만 온라인 대전에 사용할 수 있습니다</h2>
        </div>
        <span className="text-right text-[0.68rem] font-bold text-neutral-500" data-testid="text-valid-deck-count">
           {validDecks.length}개 사용 가능
        </span>
      </div>
      {decks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 bg-black/20 p-8 text-center text-sm text-neutral-500" data-testid="status-online-empty-decks">
          온라인 대전에 사용할 덱이 없습니다. 덱 편집에서 챔피언과 카드를 준비해 주세요.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {decks.map((deck) => {
            const selected = deck.id === selectedDeckId;
            const valid = deck.isValid;
            return (
              <button
                key={deck.id}
                type="button"
                data-testid={`button-online-deck-${deck.id}`}
                disabled={!valid}
                onClick={() => onSelect(deck.id)}
                className={`ko-online-action group rounded-lg border p-5 text-left ${
                  selected
                    ? "border-amber-400 bg-amber-400/[0.09]"
                    : valid
                      ? "ko-online-panel hover:bg-amber-400/[0.04]"
                      : "border-neutral-800 bg-neutral-950/70 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white">{deck.name}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs font-bold text-neutral-400">
                      <Crown className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                      {deck.champion?.name ?? "챔피언 없음"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-[0.62rem] font-black tracking-[0.14em] ${
                    valid ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-300" : "border-red-900 bg-red-950/30 text-red-300"
                  }`} data-testid={`status-online-deck-${deck.id}`}>
                     {deckValidityLabel(valid)}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[0.68rem] font-bold text-neutral-500">
                   <span>{deck.cards.length}장</span>
                  <span>{selected ? "선택됨" : valid ? "선택하기" : deck.invalidReasons[0] ?? "사용할 수 없음"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SelectedDeckStamp({ deck }: { deck: Deck | undefined }) {
  if (!deck) return null;
  return (
    <div className="flex items-center gap-3 rounded border border-amber-500/25 bg-amber-400/[0.05] px-4 py-3" data-testid="status-online-selected-deck">
      <Shield className="h-4 w-4 text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{deck.name}</p>
         <p className="truncate text-[0.68rem] font-bold text-neutral-500">{deck.champion?.name ?? "챔피언 없음"} · 서버 최종 확인</p>
      </div>
      <Check className="ml-auto h-4 w-4 text-emerald-400" aria-hidden="true" />
    </div>
  );
}

export function ModeCard({
  title,
  description,
  icon,
  onClick,
  testId,
}: {
  title: string;
  description: string;
  icon: "quick" | "friendly";
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="ko-online-panel ko-online-action group rounded-xl p-6 text-left sm:p-8"
    >
      <div className="flex items-start justify-between">
        <div className="rounded border border-amber-500/25 bg-amber-400/[0.06] p-3 text-amber-400">
          {icon === "quick" ? <Radio className="h-6 w-6" aria-hidden="true" /> : <LockKeyhole className="h-6 w-6" aria-hidden="true" />}
        </div>
        <Swords className="h-5 w-5 text-neutral-700 transition-colors group-hover:text-amber-500" aria-hidden="true" />
      </div>
      <h2 className="mt-12 text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-400">{description}</p>
      <span className="mt-7 block text-xs font-black tracking-[0.18em] text-amber-400">ENTER LOBBY →</span>
    </button>
  );
}
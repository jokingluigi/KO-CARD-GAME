import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "./presentation-config";
import { Link, useLocation } from "wouter";
import { BookOpen, Home, Layers3, ShoppingBag, Swords, Gift } from "lucide-react";

// Deliberately allowlisted: never mounted over a battle, draft pick, tower run or admin form.
const destinations = [
  { href: "/", label: "메인", icon: Home },
  { href: "/online", label: "대전", icon: Swords },
  { href: "/decks", label: "덱 편집", icon: Layers3 },
  { href: "/collection", label: "컬렉션", icon: BookOpen },
  { href: "/player-notebook", label: "내 기록", icon: BookOpen },
  { href: "/daily-quests", label: "보상", icon: Gift },
  { href: "/shop", label: "상점", icon: ShoppingBag },
];
const parentRoute: Record<string,string> = {"/packs":"/shop","/attendance":"/daily-quests","/daily-quests":"/daily-quests","/cosmetics":"/collection","/settings":"/settings"};
const sectionLabel:Record<string,string>={"/packs":"내 팩","/attendance":"출석","/daily-quests":"퀘스트","/cosmetics":"꾸미기"};
const routes = new Set([
  "/player-notebook",
  "/online",
  "/decks",
  "/collection",
  "/shop",
  "/packs",
  "/daily-quests",
  "/attendance",
  "/cosmetics",
]);
export function GameNavigation() {
  const [location] = useLocation();
  const nav = useRef<HTMLElement | null>(null),
    marker = useRef<HTMLElement | null>(null),
    prior = useRef<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const n = nav.current,
      m = marker.current;
    if (!n || !m) return;
    const place = () => {
      const item = n.querySelector<HTMLElement>("[aria-current=page]");
      if (!item) return;
      const r = item.getBoundingClientRect(),
        base = n.getBoundingClientRect(),
        next = { x: r.left - base.left, width: r.width };
      m.style.width = next.width + "px";
      m.style.transform = `translateX(${next.x}px)`;
      const old = prior.current;
      prior.current = next;
      if (old && !prefersReducedMotion())
        try {
          const a = m.animate(
            [
              { transform: `translateX(${old.x}px)`, width: old.width + "px" },
              {
                transform: `translateX(${next.x}px)`,
                width: next.width + "px",
              },
            ],
            { duration: 180, easing: "ease-out" },
          );
          return () => a.cancel();
        } catch {}
      return undefined;
    };
    const stop = place();
    const resize = () => {
      prior.current = null;
      place();
    };
    window.addEventListener("resize", resize);
    return () => {
      stop?.();
      window.removeEventListener("resize", resize);
    };
  }, [location]);
  if (!routes.has(location)) return null;
  return (
    <nav ref={nav} className="ko-game-navigation" aria-label={sectionLabel[location] ? `게임 화면 이동 · 현재 ${sectionLabel[location]}` : "게임 화면 이동"}>
      <i ref={marker} className="ko-navigation-indicator" aria-hidden="true" />
      {destinations.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={(parentRoute[location]??location) === href ? "page" : undefined}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

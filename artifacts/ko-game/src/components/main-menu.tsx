import { Bot, Globe2, Gift, Layers3, LogOut, ShoppingBag, Library } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import type { AuthUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";

type MainMenuProps = {
  onComingSoon?: (label: string) => void;
  onDeckEdit?: () => void;
  onAiMatch?: () => void;
  user?: AuthUser;
  onLogout?: () => void;
};

const menuItems = [
  {
    label: "온라인 매치",
    description: "다른 플레이어와 대결합니다",
    icon: Globe2,
  },
  {
    label: "AI 매치",
    description: "AI와 연습 대전을 즐깁니다",
    icon: Bot,
  },
  {
    label: "덱 편집",
    description: "나만의 덱을 구성합니다",
    icon: Layers3,
  },
  {
    label: "상점",
    description: "카드와 아이템을 확인합니다",
    icon: ShoppingBag,
  },
  {
    label: "컬렉션",
    description: "보유 카드와 챔피언을 확인합니다",
    icon: Library,
  },
  {
    label: "내 팩",
    description: "보유한 팩을 열어 보상을 확인합니다",
    icon: Gift,
  },
] as const;

export function MainMenu({ onComingSoon, onDeckEdit, onAiMatch, user, onLogout }: MainMenuProps) {
  const [notice, setNotice] = useState("");
  const [, navigate] = useLocation();

  return (
    <main className="ko-main-menu min-h-screen bg-[#080808] px-5 py-10 text-white sm:px-8">
      <div className="ko-main-menu__content mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <header className="ko-main-menu__header text-center">
          <h1 className="ko-main-menu__logo font-display font-black text-white">KO</h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">CARD BATTLE</p>
          {user && onLogout && (
            <div className="ko-main-menu__user">
              <span>{user.nickname}</span>
              {user.isTestAccount && (
                <span className="rounded border border-amber-500/50 bg-amber-950/40 px-2 py-1 text-[10px] font-black tracking-wider text-amber-200">
                  TEST ACCOUNT · 전체 카드/Champion · 재화 무제한
                </span>
              )}
              <span className="text-amber-300">크레딧 {user.isTestAccount ? "∞" : user.currencyBalance.toLocaleString()}</span>
              <span className="text-violet-300">프리즘 {user.isTestAccount ? "∞" : user.prismBalance.toLocaleString()}</span>
              <button type="button" onClick={onLogout} aria-label="로그아웃">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                로그아웃
              </button>
            </div>
          )}
        </header>

        <section aria-label="메인 메뉴" className="ko-main-menu__grid grid gap-4 sm:grid-cols-2">
          {menuItems.map(({ label, description, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (label === "덱 편집") {
                  onDeckEdit?.();
                  return;
                }
                if (label === "AI 매치") {
                  onAiMatch?.();
                  return;
                }
                if (label === "내 팩") {
                  navigate(ROUTES.PACKS);
                  return;
                }
                if (label === "상점") {
                  navigate(ROUTES.SHOP);
                  return;
                }
                if (label === "컬렉션") {
                  navigate(ROUTES.COLLECTION);
                  return;
                }
                setNotice(`${label}은 준비 중입니다.`);
                onComingSoon?.(label);
              }}
              className="ko-main-menu__item group flex min-h-28 flex-col items-start rounded-[10px] border bg-transparent text-left transition-all duration-200 hover:bg-amber-400/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span className="ko-main-menu__icon text-amber-400 transition-transform duration-200 group-hover:scale-105">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="ko-main-menu__copy">
                <span className="block text-lg font-black leading-none text-white">{label}</span>
                <span className="mt-2 block text-sm font-medium leading-none text-neutral-400">{description}</span>
              </span>
            </button>
          ))}
        </section>
        {notice && (
          <p role="status" className="mt-6 text-center text-sm font-bold text-amber-300">
            {notice}
          </p>
        )}
      </div>
    </main>
  );
}
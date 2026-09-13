import { Bot, Globe2, Gift, Layers3, LogOut, ShoppingBag, Library } from "lucide-react";
import { useState } from "react";
import type { AuthUser } from "@/lib/auth-client";

type MainMenuProps = {
  onComingSoon?: (label: string) => void;
  onDeckEdit?: () => void;
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
    label: "수집품",
    description: "카드팩을 열고 보유 카드를 확인합니다",
    icon: Library,
  },
  {
    label: "내 팩",
    description: "보유한 팩을 열어 보상을 확인합니다",
    icon: Gift,
  },
] as const;

export function MainMenu({ onComingSoon, onDeckEdit, user, onLogout }: MainMenuProps) {
  const [notice, setNotice] = useState("");

  return (
    <main className="ko-main-menu min-h-screen bg-[#080808] px-5 py-10 text-white sm:px-8">
      <div className="ko-main-menu__content mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <header className="ko-main-menu__header text-center">
          <h1 className="ko-main-menu__logo font-display font-black text-white">KO</h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">CARD BATTLE</p>
          {user && onLogout && (
            <div className="ko-main-menu__user">
              <span>{user.nickname}</span>
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
                if (label === "내 팩") {
                  window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/packs`;
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
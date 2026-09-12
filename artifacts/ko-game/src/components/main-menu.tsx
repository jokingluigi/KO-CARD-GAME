import { Bot, Globe2, Layers3, ShoppingBag } from "lucide-react";
import { useState } from "react";

type MainMenuProps = {
  onComingSoon?: (label: string) => void;
};

const menuItems = [
  {
    label: "AI 매치",
    description: "AI 상대와 대결",
    icon: Bot,
  },
  {
    label: "온라인 매치",
    description: "다른 플레이어와 대결",
    icon: Globe2,
  },
  {
    label: "덱 편집",
    description: "나만의 덱 구성",
    icon: Layers3,
  },
  {
    label: "상점",
    description: "카드와 아이템 확인",
    icon: ShoppingBag,
  },
] as const;

export function MainMenu({ onComingSoon }: MainMenuProps) {
  const [notice, setNotice] = useState("");

  return (
    <main className="min-h-screen bg-[#080808] px-5 py-10 text-white sm:px-8 sm:py-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <header className="mb-10 text-center sm:mb-14">
          <p className="font-display text-xs font-bold tracking-[0.45em] text-amber-400">KINGDOM OF</p>
          <h1 className="mt-2 font-display text-5xl font-black tracking-[0.12em] text-white sm:text-7xl">KO</h1>
          <p className="mt-4 text-sm font-bold tracking-[0.2em] text-neutral-500">CARD BATTLE</p>
        </header>

        <section aria-label="메인 메뉴" className="grid gap-3 sm:grid-cols-2">
          {menuItems.map(({ label, description, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setNotice(`${label}은 준비 중입니다.`);
                onComingSoon?.(label);
              }}
              className="group flex min-h-28 items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950/90 px-5 py-5 text-left shadow-xl transition-colors hover:border-amber-500/70 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-black text-amber-400 transition-colors group-hover:border-amber-500/70">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-black text-white">{label}</span>
                <span className="mt-1 block text-xs font-medium text-neutral-500">{description}</span>
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
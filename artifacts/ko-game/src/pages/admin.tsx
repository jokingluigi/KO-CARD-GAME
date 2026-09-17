import { useEffect, useState } from "react";
import { Bot, Frame, Gamepad2, Image, LogOut, Music2, Package, ShieldCheck, ShoppingBag, Sparkles, Spade } from "lucide-react";
import { useLocation } from "wouter";
import { AdminCardManager } from "@/components/admin-card-manager";
import { AdminChampionManager } from "@/components/admin-champion-manager";
import { AdminGameMediaManager } from "@/components/admin-game-media-manager";
import { AdminPackManager } from "@/components/admin-pack-manager";
import { AdminShopManager } from "@/components/admin-shop-manager";
import { AdminPrismManager } from "@/components/admin-prism-manager";
import { AdminCardSkinManager } from "@/components/admin-card-skin-manager";
import { AdminCardFrameManager } from "@/components/admin-card-frame-manager";
import { AdminAIDeckManager } from "@/components/admin-ai-deck-manager";
import { fetchCurrentUser, logout } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";

type AdminStatus = "checking" | "forbidden" | "authenticated";

export default function Admin() {
  const [location, navigate] = useLocation();
  const [status, setStatus] = useState<AdminStatus>("checking");
  const [section, setSection] = useState<"cards" | "champions" | "packs" | "skins" | "frames" | "shop" | "prism" | "media" | "test" | "ai-decks">(
    location.endsWith("/packs") ? "packs" : location.endsWith("/shop") ? "shop" : location.endsWith("/prism") ? "prism" : location.endsWith("/skins") ? "skins" : location.endsWith("/card-frames") ? "frames" : location.endsWith("/ai-decks") ? "ai-decks" : "cards",
  );

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((result) => {
        if (!cancelled) {
          setStatus(result.authenticated && result.user?.role === "ADMIN" ? "authenticated" : "forbidden");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("forbidden");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate(ROUTES.MAIN_MENU);
  }

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        관리자 세션 확인 중...
      </main>
    );
  }

  if (status === "forbidden") {
    return (
      <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-neutral-100">
        <section className="w-full max-w-sm text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-5 font-display text-xs font-bold tracking-[0.3em] text-amber-400">KO ADMIN</p>
          <h1 className="mt-3 text-xl font-black">관리자 권한이 필요합니다</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            관리자 계정으로 로그인했거나 관리자 이메일로 가입한 경우에만 접근할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES.MAIN_MENU)}
            className="mt-7 rounded bg-primary px-5 py-3 text-sm font-black text-black hover:bg-yellow-400"
          >
            메인 메뉴로
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-black/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <div className="font-display text-xs font-bold tracking-[0.25em] text-primary">
              DEVELOPER CONSOLE
            </div>
            <h1 className="text-2xl font-black">KO ADMIN</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-300 transition-colors hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:flex-row">
        <nav className="w-full shrink-0 md:w-52">
          <div className="mb-3 text-[10px] font-bold tracking-[0.2em] text-neutral-600">
            ADMIN MENU
          </div>
          <button
            type="button"
            onClick={() => setSection("cards")}
            className={`flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "cards" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Spade className="h-4 w-4" />
            카드 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("champions")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "champions" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <ShieldCheck className="h-4 w-4" />
            챔피언 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("media")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "media" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <span className="flex items-center gap-1">
              <Image className="h-4 w-4" />
              <Music2 className="h-3.5 w-3.5" />
            </span>
            백그라운드 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("packs")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "packs" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Package className="h-4 w-4" />
            카드팩 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("skins")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "skins" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Package className="h-4 w-4" />
            Card Skin 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("frames")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "frames" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Frame className="h-4 w-4" />
            카드 프레임 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("test")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "test" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Gamepad2 className="h-4 w-4" />
            게임 테스트
          </button>
          <button
            type="button"
            onClick={() => setSection("ai-decks")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "ai-decks" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Bot className="h-4 w-4" />
            AI 덱 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("shop")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "shop" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <ShoppingBag className="h-4 w-4" />
            상점 관리
          </button>
          <button
            type="button"
            onClick={() => setSection("prism")}
            className={`mt-2 flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-sm font-black ${section === "prism" ? "border-primary/60 bg-primary/10 text-primary" : "border-transparent text-neutral-400"}`}
          >
            <Sparkles className="h-4 w-4" />
            카드 제작 설정
          </button>
        </nav>

        <section className="min-w-0 flex-1">
           {section === "ai-decks"
             ? <AdminAIDeckManager onUnauthorized={() => setStatus("forbidden")} />
             : section === "cards"
            ? <AdminCardManager onUnauthorized={() => setStatus("forbidden")} />
             : section === "champions"
               ? <AdminChampionManager onUnauthorized={() => setStatus("forbidden")} />
               : section === "packs"
                 ? <AdminPackManager onUnauthorized={() => setStatus("forbidden")} />
                : section === "skins"
                  ? <AdminCardSkinManager onUnauthorized={() => setStatus("forbidden")} />
                 : section === "frames"
                   ? <AdminCardFrameManager onUnauthorized={() => setStatus("forbidden")} />
               : section === "media"
                 ? <AdminGameMediaManager onUnauthorized={() => setStatus("forbidden")} />
                  : section === "shop"
                    ? <AdminShopManager onUnauthorized={() => setStatus("forbidden")} />
                     : section === "prism"
                       ? <AdminPrismManager onUnauthorized={() => setStatus("forbidden")} />
                 : (
                   <section className="rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-8">
                     <div className="mb-6 flex items-start gap-4">
                       <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-700/60 bg-amber-950/40 text-amber-300">
                         <Gamepad2 className="h-5 w-5" />
                       </div>
                       <div>
                         <h2 className="text-xl font-black text-white">게임 테스트</h2>
                         <p className="mt-1 text-sm leading-6 text-neutral-500">
                           현재 개발 중인 기존 테스트 게임 화면으로 이동합니다.
                         </p>
                       </div>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                          navigate(`${ROUTES.MAIN_MENU}?source=admin`);
                       }}
                       className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-black text-black transition-colors hover:bg-yellow-400 sm:w-auto"
                     >
                       기존 테스트 모드 열기
                     </button>
                   </section>
                 )}
        </section>
      </div>
    </main>
  );
}
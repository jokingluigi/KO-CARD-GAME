import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";
import { fetchCurrentUser, logout } from "@/lib/auth-client";
import { AuthRecovery } from "@/components/auth-page";
import { ROUTES } from "@/lib/routes";
import { AdminLayout } from "@/components/admin-layout";
import "@/styles/admin-console.css";
const AdminDashboard = lazy(() =>
  import("@/components/admin-dashboard").then((m) => ({
    default: m.AdminDashboard,
  })),
);
const AdminUserDirectory = lazy(() =>
  import("@/components/admin-dashboard").then((m) => ({
    default: m.AdminUserDirectory,
  })),
);
const AdminServerMaintenance = lazy(() =>
  import("@/components/server-maintenance").then((m) => ({
    default: m.AdminServerMaintenance,
  })),
);
const AdminQuestManager = lazy(() =>
  import("@/components/admin-quest-manager").then((m) => ({
    default: m.AdminQuestManager,
  })),
);
const AdminTagManager = lazy(() =>
  import("@/components/admin-tag-manager").then((m) => ({
    default: m.AdminTagManager,
  })),
);
const AdminDraftManager = lazy(() =>
  import("@/components/admin-draft-manager").then((m) => ({
    default: m.AdminDraftManager,
  })),
);
const AdminTowerManager = lazy(() =>
  import("@/components/admin-tower-manager").then((m) => ({
    default: m.AdminTowerManager,
  })),
);
const AdminTowerTest = lazy(() =>
  import("@/components/admin-tower-test").then((m) => ({
    default: m.AdminTowerTest,
  })),
);
const AdminCardManager = lazy(() =>
  import("@/components/admin-card-manager").then((m) => ({
    default: m.AdminCardManager,
  })),
);
const AdminChampionManager = lazy(() =>
  import("@/components/admin-champion-manager").then((m) => ({
    default: m.AdminChampionManager,
  })),
);
const AdminPackManager = lazy(() =>
  import("@/components/admin-pack-manager").then((m) => ({
    default: m.AdminPackManager,
  })),
);
const AdminCardSkinManager = lazy(() =>
  import("@/components/admin-card-skin-manager").then((m) => ({
    default: m.AdminCardSkinManager,
  })),
);
const AdminCardFrameManager = lazy(() =>
  import("@/components/admin-card-frame-manager").then((m) => ({
    default: m.AdminCardFrameManager,
  })),
);
const AdminShopManager = lazy(() =>
  import("@/components/admin-shop-manager").then((m) => ({
    default: m.AdminShopManager,
  })),
);
const AdminPrismManager = lazy(() =>
  import("@/components/admin-prism-manager").then((m) => ({
    default: m.AdminPrismManager,
  })),
);
const AdminGameMediaManager = lazy(() =>
  import("@/components/admin-game-media-manager").then((m) => ({
    default: m.AdminGameMediaManager,
  })),
);
const AdminNoticesManager = lazy(() =>
  import("@/components/admin-notices-manager").then((m) => ({
    default: m.AdminNoticesManager,
  })),
);
const AdminAIDeckManager = lazy(() =>
  import("@/components/admin-ai-deck-manager").then((m) => ({
    default: m.AdminAIDeckManager,
  })),
);
const AdminRewardsManager = lazy(() =>
  import("@/components/admin-rewards-manager").then((m) => ({
    default: m.AdminRewardsManager,
  })),
);
type AdminStatus = "checking" | "forbidden" | "error" | "authenticated";
export default function Admin() {
  const [, navigate] = useLocation(),
    [status, setStatus] = useState<AdminStatus>("checking"),
    [authError, setAuthError] = useState<string | null>(null),
    authRequestGeneration = useRef(0);
  const onUnauthorized = useCallback(() => setStatus("forbidden"), []);
  const checkAuthentication = useCallback(() => {
    const generation = ++authRequestGeneration.current;
    setStatus("checking");
    setAuthError(null);
    fetchCurrentUser()
      .then((result) => {
        if (generation !== authRequestGeneration.current) return;
        setStatus(
          result.authenticated && result.user?.role === "ADMIN"
            ? "authenticated"
            : "forbidden",
        );
      })
      .catch((error) => {
        if (generation !== authRequestGeneration.current) return;
        setAuthError(
          error instanceof Error
            ? error.message
            : "인증 상태를 확인하지 못했습니다.",
        );
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    checkAuthentication();
    return () => {
      authRequestGeneration.current += 1;
    };
  }, [checkAuthentication]);

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

  if (status === "error") {
    return (
      <AuthRecovery
        message={authError ?? undefined}
        onRetry={checkAuthentication}
      />
    );
  }

  if (status === "forbidden") {
    return (
      <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-neutral-100">
        <section className="w-full max-w-sm text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-5 font-display text-xs font-bold tracking-[0.3em] text-amber-400">
            KO ADMIN
          </p>
          <h1 className="mt-3 text-xl font-black">관리자 권한이 필요합니다</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            관리자 계정으로 로그인했거나 관리자 이메일로 가입한 경우에만 접근할
            수 있습니다.
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
    <AdminLayout onLogout={() => void handleLogout()}>
      {(go, page) => (
        <Suspense
          fallback={
            <div className="admin-panel-loading" role="status">
              관리 화면을 불러오는 중…
            </div>
          }
        >
          {page?.id === "dashboard" ? (
            <AdminDashboard go={go} />
          ) : page?.id === "users" ? (
            <AdminUserDirectory go={go} />
          ) : page?.id === "system" ? (
            <AdminServerMaintenance />
          ) : page?.id === "test" ? (
            <section className="admin-test-launch">
              <h2>실제 전투 엔진 테스트</h2>
              <p>기존 테스트 게임에서 선수·주문·챔피언 효과를 확인합니다.</p>
              <button
                onClick={() => navigate(ROUTES.MAIN_MENU + "?source=admin")}
              >
                기존 테스트 모드 열기
              </button>
              <div className="admin-related-links">
                <button onClick={() => go("cards")}>카드별 테스트</button>
                <button onClick={() => go("champions")}>챔피언별 테스트</button>
                <button onClick={() => go("tower")}>타워 콘텐츠 테스트</button>
                <button onClick={() => go("tower-test")}>
                  타워 전투 샌드박스
                </button>
              </div>
            </section>
          ) : page?.id === "quests" ? (
            <AdminQuestManager />
          ) : page?.id === "tags" ? (
            <AdminTagManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "draft" ? (
            <AdminDraftManager />
          ) : page?.id === "tower" ? (
            <AdminTowerManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "tower-test" ? (
            <AdminTowerTest onUnauthorized={onUnauthorized} />
          ) : page?.id === "cards" ? (
            <AdminCardManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "champions" ? (
            <AdminChampionManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "packs" ? (
            <AdminPackManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "skins" ? (
            <AdminCardSkinManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "frames" ? (
            <AdminCardFrameManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "shop" ? (
            <AdminShopManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "prism" ? (
            <AdminPrismManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "media" ? (
            <AdminGameMediaManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "notices" ? (
            <AdminNoticesManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "ai-decks" ? (
            <AdminAIDeckManager onUnauthorized={onUnauthorized} />
          ) : page?.id === "rewards" ? (
            <AdminRewardsManager onUnauthorized={onUnauthorized} />
          ) : (
            <button onClick={() => go("dashboard")}>운영 개요로 이동</button>
          )}
        </Suspense>
      )}
    </AdminLayout>
  );
}

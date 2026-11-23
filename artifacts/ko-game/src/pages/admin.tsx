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
import { logout, type AuthUser } from "@/lib/auth-client";
import { fetchAdminSession } from '@/lib/admin-session-client';
import { AuthRecovery } from "@/components/auth-page";
import { ROUTES } from "@/lib/routes";
import { AdminLayout } from "@/components/admin-layout";
import "@/styles/admin-console.css";
import "@/components/admin-workspace.css";
const AdminSystem = lazy(() => import("@/components/admin-system").then((m) => ({ default: m.AdminSystem })));
const AdminCosmetics = lazy(() => import("@/components/admin-cosmetics").then((m) => ({ default: m.AdminCosmetics })));
const AdminShopHub = lazy(() => import("@/components/admin-hubs").then((m) => ({ default: m.AdminShopHub })));
const AdminStatisticsHub = lazy(() => import("@/components/admin-hubs").then((m) => ({ default: m.AdminStatisticsHub })));
const AdminUserAssets = lazy(() => import("@/components/admin-hubs").then((m) => ({ default: m.AdminUserAssets })));
const AdminBattleSprites = lazy(() => import("@/components/admin-battle-sprites").then(m=>({default:m.AdminBattleSprites})));
const AdminDashboard = lazy(() =>
  import("@/components/admin-dashboard").then((m) => ({
    default: m.AdminDashboard,
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
const AdminCardStudio = lazy(() =>
  import("@/components/admin-card-studio").then((m) => ({
    default: m.AdminCardStudio,
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
const AdminCardFrameManager = lazy(() =>
  import("@/components/admin-card-frame-manager").then((m) => ({
    default: m.AdminCardFrameManager,
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
  const sessionRequest = useRef<AbortController | null>(null);
  const [slowSession, setSlowSession] = useState(false);
  const onUnauthorized = useCallback(() => setStatus("forbidden"), []);
  const checkAuthentication = useCallback(() => {
    if (sessionRequest.current) return;
    const controller = new AbortController();
    sessionRequest.current = controller;
    const generation = ++authRequestGeneration.current;
    setStatus(previous => previous === "error" ? "error" : "checking");
    setAuthError(null);
    fetchAdminSession(controller.signal)
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
      }).finally(() => {
        if (sessionRequest.current === controller) sessionRequest.current = null;
      });
  }, []);

  useEffect(() => {
    if (status !== 'checking') { setSlowSession(false); return; }
    const timer = window.setTimeout(() => setSlowSession(true), 1_500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    checkAuthentication();
    return () => {
      authRequestGeneration.current += 1;
      sessionRequest.current?.abort();
      sessionRequest.current = null;
    };
  }, [checkAuthentication]);

  async function handleLogout() {
    await logout();
    navigate(ROUTES.MAIN_MENU);
  }

  if (status === "checking" && !slowSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        관리자 세션 확인 중...
      </main>
    );
  }

  if (status === "error" || (status === 'checking' && slowSession)) {
    return (
      <AuthRecovery
        message={authError ?? undefined}
        onRetry={checkAuthentication}
        onAuthenticated={(user: AuthUser) => {
          authRequestGeneration.current += 1;
          sessionRequest.current?.abort();
          sessionRequest.current = null;
          setStatus(user.role === 'ADMIN' ? 'authenticated' : 'forbidden');
        }}
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
      {(go, page, displayPath, goPath) => (
        <Suspense
          fallback={
            <div className="admin-panel-loading" role="status">
              관리 화면을 불러오는 중…
            </div>
          }
        >
          {page?.id === "dashboard" ? <AdminDashboard go={go} goPath={goPath} />
          : page?.id === "cards" ? <AdminCardStudio onUnauthorized={onUnauthorized} onOpenAdvanced={(id) => goPath(`/admin/card-edit?edit=${encodeURIComponent(id)}`)} onTestGame={(id) => navigate(`${ROUTES.MAIN_MENU}?source=admin&testCardId=${encodeURIComponent(id)}`)} />
          : page?.id === "card-edit" ? <AdminCardManager onUnauthorized={onUnauthorized} editOnly onDone={(id?: string) => goPath(id ? `/admin/cards?card=${encodeURIComponent(id)}` : "/admin/cards")} />
          : page?.id === "tags" ? <AdminTagManager onUnauthorized={onUnauthorized} />
          : page?.id === "frames" ? <AdminCardFrameManager onUnauthorized={onUnauthorized} />
          : page?.id === "champions" ? <AdminChampionManager onUnauthorized={onUnauthorized} />
          : page?.id === "battle-sprites" ? <AdminBattleSprites />
          : page?.id === "ai-decks" ? <AdminAIDeckManager onUnauthorized={onUnauthorized} />
          : page?.id === "draft" ? <AdminDraftManager />
          : page?.id === "shop" ? <AdminShopHub legacyPath={displayPath} onUnauthorized={onUnauthorized} />
          : page?.id === "packs" ? <AdminPackManager onUnauthorized={onUnauthorized} />
          : page?.id === "prism" ? <AdminPrismManager onUnauthorized={onUnauthorized} />
          : page?.id === "rewards" ? <AdminRewardsManager onUnauthorized={onUnauthorized} />
          : page?.id === "quests" ? <AdminQuestManager onUnauthorized={onUnauthorized} />
          : page?.id === "cosmetics" ? <AdminCosmetics />
          : page?.id === "media" ? <AdminGameMediaManager onUnauthorized={onUnauthorized} />
          : page?.id === "notices" ? <AdminNoticesManager onUnauthorized={onUnauthorized} />
          : page?.id === "users" ? <AdminUserAssets onUnauthorized={onUnauthorized} />
          : page?.id === "statistics" ? <AdminStatisticsHub legacyPath={displayPath} onUnauthorized={onUnauthorized} />
          : page?.id === "system" ? <AdminSystem onUnauthorized={onUnauthorized} />
          : (
            <button onClick={() => go("dashboard")}>홈으로 이동</button>
          )}
        </Suspense>
      )}
    </AdminLayout>
  );
}

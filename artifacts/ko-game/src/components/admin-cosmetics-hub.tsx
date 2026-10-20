import { lazy, Suspense } from "react";
import { AdminCosmetics } from "./admin-cosmetics";
const LegacyCardSkins = lazy(() =>
  import("./admin-card-skin-manager").then((module) => ({
    default: module.AdminCardSkinManager,
  })),
);

/** One navigation entry, with the original pack skin editor kept intact. */
export function AdminCosmeticsHub({
  onUnauthorized,
  legacy,
  onNavigate,
}: {
  onUnauthorized: () => void;
  legacy: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <section>
      <nav aria-label="꾸미기 관리 구분" className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!legacy}
          className="min-h-11 rounded border border-amber-800 px-4 aria-pressed:bg-amber-400 aria-pressed:text-black"
          onClick={() => onNavigate("/admin/cosmetics")}
        >
          스킨·이모티콘 · 지급·장착
        </button>
        <button
          type="button"
          aria-pressed={legacy}
          className="min-h-11 rounded border border-amber-800 px-4 aria-pressed:bg-amber-400 aria-pressed:text-black"
          onClick={() => onNavigate("/admin/skins")}
        >
          기존 카드팩 스킨
        </button>
      </nav>
      {legacy ? (
        <>
          <p className="mb-4 text-sm text-neutral-400">
            기존 카드팩에서 지급하는 카드 스킨이야. 기존 등록·소유 기록과 카드팩
            설정은 그대로 유지돼.
          </p>
          <Suspense fallback={<p role="status">기존 스킨을 불러오는 중…</p>}>
            <LegacyCardSkins onUnauthorized={onUnauthorized} />
          </Suspense>
        </>
      ) : (
        <AdminCosmetics />
      )}
    </section>
  );
}

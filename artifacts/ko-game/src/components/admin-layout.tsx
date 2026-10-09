import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Layers,
  Shield,
  Swords,
  Coins,
  Image,
  Users,
  FlaskConical,
  Settings,
  Menu,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  LogOut,
} from "lucide-react";
import {
  ADMIN_GROUPS,
  ADMIN_PAGES,
  adminPageForPath,
  searchAdminPages,
  validAdminPageIds,
  type AdminPageId,
} from "@/lib/admin-navigation";
import {
  AdminDirtyContext,
  confirmDiscardAdminDraft,
} from "./admin-editor-sections";
const icons = {
  LayoutDashboard,
  Layers,
  Shield,
  Swords,
  Coins,
  Image,
  Users,
  FlaskConical,
  Settings,
};
function stored(key: string) {
  try {
    return validAdminPageIds(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}
export function AdminLayout({
  children,
  onLogout,
}: {
  children: (
    go: (id: AdminPageId) => void,
    page: ReturnType<typeof adminPageForPath>,
  ) => ReactNode;
  onLogout: () => void;
}) {
  const [location, navigate] = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const current = adminPageForPath(displayLocation);
  const [drawer, setDrawer] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<string[]>(() =>
      current ? [current.group] : [],
    ),
    [recent, setRecent] = useState(() => stored("ko-admin-recent")),
    [favorites, setFavorites] = useState(() => stored("ko-admin-favorites"));
  const [maintenance, setMaintenance] = useState<boolean | null>(null),
    [statusFailed, setStatusFailed] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({}),
    dirtyRef = useRef(false),
    lastPath = useRef(location),
    historyIndex = useRef(history.state?.koAdminIndex ?? 0);
  dirtyRef.current = Object.values(dirty).some(Boolean);
  const register = useCallback(
    (id: string, value: boolean) =>
      setDirty((old) => (old[id] === value ? old : { ...old, [id]: value })),
    [],
  );
  useEffect(() => {
    if (!dirtyRef.current) setDisplayLocation(location);
  }, [location, dirty]);
  const go = useCallback(
    (id: AdminPageId) => {
      const p = ADMIN_PAGES.find((p) => p.id === id);
      if (!p || p.path === location) return;
      if (!confirmDiscardAdminDraft(dirtyRef.current)) return;
      setDirty({});
      setDrawer(false);
      setQuery("");
      historyIndex.current++;
      navigate(p.path, { state: { koAdminIndex: historyIndex.current } });
    },
    [location, navigate],
  );
  useEffect(() => {
    if (!current) return;
    setExpanded((old) =>
      old.includes(current.group) ? old : [...old, current.group],
    );
    setRecent((old) => {
      const next = [current.id, ...old.filter((id) => id !== current.id)].slice(
        0,
        6,
      );
      try {
        localStorage.setItem("ko-admin-recent", JSON.stringify(next));
      } catch {}
      return next;
    });
    lastPath.current = displayLocation;
  }, [displayLocation, current?.id]);
  useEffect(() => {
    history.replaceState(
      { ...history.state, koAdminIndex: history.state?.koAdminIndex ?? 0 },
      "",
    );
    const before = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pop = (e: PopStateEvent) => {
      const next = e.state?.koAdminIndex;
      // Guard before the router unmounts the editor; restoring history keeps its draft.
      if (dirtyRef.current && next === historyIndex.current) return;
      if (dirtyRef.current && !confirmDiscardAdminDraft(true)) {
        e.stopImmediatePropagation();
        if (typeof next === "number") history.go(historyIndex.current - next);
        else
          history.replaceState(
            { ...history.state, koAdminIndex: historyIndex.current },
            "",
            lastPath.current,
          );
        return;
      }
      setDirty({});
      if (typeof next === "number") historyIndex.current = next;
      setDrawer(false);
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("popstate", pop, true);
    };
  }, [navigate]);
  useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    searchInput.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".admin-sidebar button,.admin-sidebar a,.admin-sidebar input",
        ),
      ).filter((n) => n.getClientRects().length && !n.hasAttribute("disabled"));
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previousFocus?.focus();
    };
  }, [drawer]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetch(
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin/server-maintenance`,
        { credentials: "include" },
      )
        .then(async (r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((s) => {
          if (alive) {
            setMaintenance(Boolean(s.enabled));
            setStatusFailed(false);
          }
        })
        .catch(() => {
          if (alive) setStatusFailed(true);
        });
    };
    refresh();
    window.addEventListener("ko-admin-maintenance-changed", refresh);
    return () => {
      alive = false;
      window.removeEventListener("ko-admin-maintenance-changed", refresh);
    };
  }, []);
  function favorite() {
    if (!current) return;
    const next = favorites.includes(current.id)
      ? favorites.filter((x) => x !== current.id)
      : [...favorites, current.id].slice(-10);
    setFavorites(next);
    try {
      localStorage.setItem("ko-admin-favorites", JSON.stringify(next));
    } catch {}
  }
  const group = ADMIN_GROUPS.find((g) => g.id === current?.group),
    matches = query ? searchAdminPages(query) : null;
  return (
    <AdminDirtyContext.Provider value={{ register }}>
      <div
        className={"ko-admin " + (collapsed ? "admin-sidebar-collapsed" : "")}
      >
        <a className="admin-skip-link" href="#admin-content">
          본문으로 이동
        </a>
        {drawer && (
          <button
            className="admin-drawer-backdrop"
            aria-label="메뉴 닫기"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside
          className={"admin-sidebar " + (drawer ? "is-open" : "")}
          aria-label="관리자 탐색"
        >
          <div className="admin-brand">
            <span>KO</span>
            <div>
              <strong>OPERATIONS</strong>
              <small>게임 운영 콘솔</small>
            </div>
            <button
              className="admin-drawer-close"
              onClick={() => setDrawer(false)}
              aria-label="메뉴 닫기"
            >
              <X />
            </button>
          </div>
          <label className="admin-menu-search">
            <Search size={16} />
            <input
              ref={searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="관리 메뉴 검색"
              aria-label="관리 메뉴 검색"
            />
          </label>
          <nav aria-label="관리 메뉴">
            {matches ? (
              <div className="admin-search-results">
                {matches.map((p) => (
                  <button key={p.id} onClick={() => go(p.id)}>
                    {p.label}
                    <small>
                      {ADMIN_GROUPS.find((g) => g.id === p.group)?.label}
                    </small>
                  </button>
                ))}
                {!matches.length && <p>일치하는 관리 화면이 없습니다.</p>}
              </div>
            ) : (
              <>
                {ADMIN_GROUPS.map((g) => {
                  const Icon = icons[g.icon],
                    open = expanded.includes(g.id);
                  return (
                    <div className="admin-nav-group" key={g.id}>
                      <button
                        className={
                          "admin-nav-heading " +
                          (current?.group === g.id ? "is-current" : "")
                        }
                        aria-expanded={open}
                        title={g.label}
                        onClick={() => {
                          if (collapsed) {
                            setCollapsed(false);
                            setExpanded((old) => [...new Set([...old, g.id])]);
                          } else
                            setExpanded((old) =>
                              open
                                ? old.filter((id) => id !== g.id)
                                : [...old, g.id],
                            );
                        }}
                      >
                        <Icon size={18} />
                        <span>{g.label}</span>
                        <ChevronDown size={14} />
                      </button>
                      {open && !collapsed && (
                        <div className="admin-nav-children">
                          {ADMIN_PAGES.filter((p) => p.group === g.id).map(
                            (p) => (
                              <a
                                href={p.path}
                                key={p.id}
                                aria-current={
                                  current?.id === p.id ? "page" : undefined
                                }
                                onClick={(e) => {
                                  if (
                                    e.button ||
                                    e.metaKey ||
                                    e.ctrlKey ||
                                    e.shiftKey ||
                                    e.altKey
                                  )
                                    return;
                                  e.preventDefault();
                                  go(p.id);
                                }}
                              >
                                {p.label}
                              </a>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {favorites.length > 0 && !collapsed && (
                  <div className="admin-saved-links">
                    <h3>즐겨찾기</h3>
                    {favorites.map((id) => (
                      <button key={id} onClick={() => go(id)}>
                        {ADMIN_PAGES.find((p) => p.id === id)?.label}
                      </button>
                    ))}
                  </div>
                )}
                {recent.length > 0 && !collapsed && (
                  <div className="admin-saved-links">
                    <h3>최근 사용</h3>
                    {recent.slice(0, 4).map((id) => (
                      <button key={id} onClick={() => go(id)}>
                        {ADMIN_PAGES.find((p) => p.id === id)?.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </nav>
          <button
            className="admin-collapse-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>메뉴 접기</span>
          </button>
        </aside>
        <div className="admin-main" inert={drawer}>
          <header className="admin-topbar">
            <button
              className="admin-mobile-menu"
              aria-expanded={drawer}
              aria-label="관리 메뉴 열기"
              onClick={() => setDrawer(true)}
            >
              <Menu />
            </button>
            <div className="admin-breadcrumb">
              <span>KO ADMIN</span>
              <i>/</i>
              <span>{group?.label ?? "관리자"}</span>
              {current && (
                <>
                  <i>/</i>
                  <strong>{current.label}</strong>
                </>
              )}
            </div>
            <button
              className="admin-header-search"
              aria-label="관리 메뉴 검색 열기"
              onClick={() => {
                setCollapsed(false);
                if (matchMedia("(max-width:900px)").matches) setDrawer(true);
                requestAnimationFrame(() => searchInput.current?.focus());
              }}
            >
              <Search size={16} />
              <span>메뉴 검색</span>
            </button>
            <button
              className="admin-server-status"
              onClick={() => go("system")}
              title="서버 점검 설정으로 이동"
            >
              <span className={maintenance ? "is-maintenance" : ""} />
              {statusFailed
                ? "상태 확인 실패"
                : maintenance === null
                  ? "상태 확인 중"
                  : maintenance
                    ? "점검 중"
                    : "정상 운영"}
            </button>
            {dirtyRef.current && (
              <span className="admin-dirty-status" role="status">
                저장되지 않은 변경사항
              </span>
            )}
            <button
              className="admin-logout"
              onClick={() => {
                if (confirmDiscardAdminDraft(dirtyRef.current)) onLogout();
              }}
            >
              <LogOut size={16} />
              <span>로그아웃</span>
            </button>
          </header>
          <main id="admin-content" className="admin-content">
            <div className="admin-page-heading">
              <div>
                <p>{group?.label ?? "관리자"}</p>
                <h1>{current?.label ?? "관리 화면을 찾을 수 없습니다"}</h1>
                <span>
                  {current?.description ??
                    "메뉴에서 관리 화면을 선택해 주세요."}
                </span>
              </div>
              {current && (
                <button
                  aria-label="현재 메뉴 즐겨찾기"
                  aria-pressed={favorites.includes(current.id)}
                  onClick={favorite}
                >
                  <Star
                    size={18}
                    fill={
                      favorites.includes(current.id) ? "currentColor" : "none"
                    }
                  />
                </button>
              )}
            </div>
            {children(go, current)}
          </main>
        </div>
      </div>
    </AdminDirtyContext.Provider>
  );
}

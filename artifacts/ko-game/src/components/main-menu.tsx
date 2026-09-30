import { BookOpen, Bot, CalendarCheck2, ClipboardList, Globe2, Gift, Layers3, LogOut, ShoppingBag, Library, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { changeNickname, type AuthUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { emptyMainContent, fetchMainContent, type MainContent } from "@/lib/main-content-client";
import { audioManager } from "@/audio/audio-manager";
import { BGM_MUTE_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY, readStoredBgmMute, readStoredBgmVolume } from "@/audio/audio-settings";
import { SfxVolumeControl } from "./sfx-volume-control";
import { MatchTutorial } from "./match-tutorial";
import { InstallAppButton } from "./install-app-button";

type MainMenuProps = {
  onComingSoon?: (label: string) => void;
  onDeckEdit?: () => void;
  onAiMatch?: () => void;
  user?: AuthUser;
  onLogout?: () => void;
  onNicknameChanged?: (user: AuthUser) => void;
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
    label: "튜토리얼",
    description: "카드 사용과 공격 방법을 배웁니다",
    icon: BookOpen,
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
  {
    label: "일일 퀘스트",
    description: "오늘의 퀘스트를 완료하고 보상을 받습니다",
    icon: ClipboardList,
  },
  {
    label: "출석 보드",
    description: "매일 출석하고 단계별 보상을 받습니다",
    icon: CalendarCheck2,
  },
] as const;

export function MainMenu({ onComingSoon, onDeckEdit, onAiMatch, user, onLogout, onNicknameChanged }: MainMenuProps) {
  const [towerEnabled, setTowerEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [mainContent, setMainContent] = useState<MainContent>(emptyMainContent);
  const [backgroundState, setBackgroundState] = useState<"fallback" | "loading" | "ready">("fallback");
  const [bgmMuted, setBgmMuted] = useState(readStoredBgmMute);
  const [bgmVolume, setBgmVolume] = useState(readStoredBgmVolume);
  const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    void fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/tower/availability`, { cache: 'no-store', signal: controller.signal })
      .then(r => r.ok ? r.json() : { enabled: false }).then(data => { if (!cancelled) setTowerEnabled(data.enabled === true); })
      .catch(() => {}).finally(() => clearTimeout(timer));
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMainContent()
      .then((content) => {
        if (cancelled) return;
        setMainContent(content);
      })
      .catch((error) => {
        if (!cancelled) console.warn("메인 콘텐츠를 불러오지 못했습니다.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = mainContent.background?.assetUrl;
    if (!url) {
      setBackgroundState("fallback");
      return;
    }
    setBackgroundState("loading");
    const image = new window.Image();
    image.onload = () => setBackgroundState("ready");
    image.onerror = () => setBackgroundState("fallback");
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [mainContent.background?.assetUrl]);

  const backgroundUrl = backgroundState === "ready" ? mainContent.background?.assetUrl : null;

  function toggleBgm() {
    const next = !bgmMuted;
    setBgmMuted(next);
    audioManager.setBgmMuted(next);
    try { window.localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
  }

  return (
    <main className="ko-main-menu relative min-h-screen overflow-hidden bg-[#080808] px-5 py-10 text-white sm:px-8">
      <button type="button" onClick={toggleBgm} aria-label={bgmMuted ? "배경음 켜기" : "배경음 음소거"} aria-pressed={bgmMuted} className="absolute right-28 top-4 z-20 flex items-center gap-2 rounded border border-amber-500/50 bg-neutral-950/80 px-3 py-2 text-xs font-bold text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
        {bgmMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {bgmMuted ? "음소거" : "배경음"}
      </button>
      <button type="button" onClick={() => setSoundSettingsOpen((open) => !open)} aria-expanded={soundSettingsOpen}
        className="absolute right-4 top-4 z-20 rounded border border-amber-500/50 bg-neutral-950/80 px-3 py-2 text-xs font-bold text-amber-200">음량 설정</button>
      {soundSettingsOpen && <div className="absolute right-4 top-16 z-20 w-44 rounded border border-amber-500/50 bg-neutral-950/95 p-3 shadow-xl">
        <label className="block text-xs font-bold text-neutral-300">
          <span className="flex justify-between"><span>배경음 볼륨</span><span>{bgmVolume}%</span></span>
          <input type="range" min="0" max="100" value={bgmVolume} aria-label="배경음 볼륨" className="mt-2 w-full accent-amber-400"
            onChange={(event) => {
              const next = Number(event.target.value);
              setBgmVolume(next);
              audioManager.setBgmVolume(next);
              try { window.localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
            }} />
        </label>
        <div className="mt-3"><SfxVolumeControl /></div>
      </div>}
      {backgroundUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(8, 8, 8, 0.72), rgba(8, 8, 8, 0.9)), url(${JSON.stringify(backgroundUrl)})` }}
        />
      )}
      <div className="ko-main-menu__content relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <header className="ko-main-menu__header text-center">
          <h1 className="ko-main-menu__logo font-display font-black text-white">KO</h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">CARD BATTLE</p>
          <InstallAppButton />
          {user && onLogout && (
            <div className="ko-main-menu__user">
              <span>{user.nickname}</span>
              <button type="button" className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-200" onClick={() => {
                setNicknameDraft(user.nickname);
                setNicknameError("");
                setEditingNickname((open) => !open);
              }}>닉네임 변경</button>
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
          {user && editingNickname && <form className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-center gap-2" onSubmit={async (event) => {
            event.preventDefault();
            if (nicknameSaving) return;
            const nickname = nicknameDraft.trim();
            if (Array.from(nickname).length < 2 || Array.from(nickname).length > 16) {
              setNicknameError("닉네임은 2~16자로 입력해 주세요.");
              return;
            }
            setNicknameSaving(true);
            setNicknameError("");
            try {
              const updated = await changeNickname(nickname);
              onNicknameChanged?.(updated);
              setEditingNickname(false);
            } catch (error) {
              setNicknameError(error instanceof Error ? error.message : "닉네임을 변경하지 못했습니다.");
            } finally {
              setNicknameSaving(false);
            }
          }}>
            <label htmlFor="nickname-edit" className="sr-only">새 닉네임</label>
            <input id="nickname-edit" value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} disabled={nicknameSaving} maxLength={32} autoComplete="nickname" className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm text-white" placeholder="새 닉네임 (2~16자)" />
            <button disabled={nicknameSaving} type="submit" className="rounded bg-amber-400 px-3 py-2 text-xs font-bold text-black disabled:opacity-50">{nicknameSaving ? "저장 중" : "저장"}</button>
            <button type="button" onClick={() => setEditingNickname(false)} className="rounded border border-neutral-600 px-3 py-2 text-xs">취소</button>
            {nicknameError && <p role="alert" className="w-full text-sm text-red-300">{nicknameError}</p>}
          </form>}
        </header>

        {mainContent.notices.length > 0 && (
          <section className="mb-6 rounded-lg border border-amber-700/60 bg-black/55 p-4 shadow-xl" aria-label="공지">
            <button type="button" aria-expanded={announcementsOpen} onClick={() => setAnnouncementsOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 text-left">
              <h2 className="text-xs font-black tracking-[0.2em] text-amber-300">공지 · {mainContent.notices.length}건</h2>
              <span className="text-[10px] font-bold text-neutral-300">{announcementsOpen ? '접기 ▲' : '펼치기 ▼'}</span>
            </button>
            {announcementsOpen && <div className="mt-3 space-y-3">
              {mainContent.notices.map((item) => (
                <article key={item.id} className="border-l-2 border-amber-400/70 pl-3">
                  <h3 className="text-sm font-black text-white">{item.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-neutral-300">{item.body}</p>
                </article>
              ))}
            </div>}
          </section>
        )}

        <section aria-label="메인 메뉴" className="ko-main-menu__grid grid gap-4 sm:grid-cols-2">
          {[...menuItems, ...(towerEnabled ? [{ label: '타워 모드', description: '16층 도전에서 덱을 성장시킵니다', icon: Layers3 }] : [])].map(({ label, description, icon: Icon }) => (
            <button
              key={label}
              type="button"
              data-testid={`button-main-menu-${label === "온라인 매치" ? "online" : label === "AI 매치" ? "ai" : label}`}
              onClick={() => {
                if (label === '타워 모드') { navigate('/tower'); return; }
                if (label === "덱 편집") {
                  onDeckEdit?.();
                  return;
                }
                if (label === "AI 매치") {
                  onAiMatch?.();
                  return;
                }
                if (label === "튜토리얼") {
                  setTutorialStep(0);
                  return;
                }
                if (label === "온라인 매치") {
                  navigate(ROUTES.ONLINE);
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
                if (label === "일일 퀘스트") {
                  navigate(ROUTES.DAILY_QUESTS);
                  return;
                }
                if (label === "출석 보드") {
                  navigate(ROUTES.ATTENDANCE);
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
      {tutorialStep !== null && (
        <MatchTutorial step={tutorialStep} onStepChange={setTutorialStep} onClose={() => setTutorialStep(null)} />
      )}
    </main>
  );
}

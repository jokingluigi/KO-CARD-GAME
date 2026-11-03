import { MotionNumber } from "./presentation-motion";
import {HomePacksShortcut} from "./home-packs-shortcut";
import type {HomeLaunchStatus} from "./launch-deck-banner";
import {HomeBackgroundImage} from "./home-background-image";
import {useHomeRewardStatus} from "./home-reward-status";
import {latestHomeNotice,homeNoticeVersion} from "./home-lobby-policy";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from "./ui/dropdown-menu";
import {ReadingAccessibilitySettings} from "./player-ux/reading-accessibility";
import {BattleModeButton} from "./battle-mode-button";
import {LaunchDeckBanner} from "./launch-deck-banner";
import "./main-menu-viewport.css";
import { BookOpen, Bot, CalendarCheck2, ClipboardList, Globe2, Gift, Layers3, LogOut, ShoppingBag, Library, Volume2, VolumeX, Pencil, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { changeNickname, type AuthUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { emptyMainContent, fetchMainContent, type MainContent } from "@/lib/main-content-client";
import { audioManager } from "@/audio/audio-manager";
import { BGM_MUTE_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY, readStoredBgmMute, readStoredBgmVolume } from "@/audio/audio-settings";
import { SfxVolumeControl } from "./sfx-volume-control";
import { InstallAppButton } from "./install-app-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

type MainMenuProps = {
  onComingSoon?: (label: string) => void;
  onDeckEdit?: () => void;
  onAiMatch?: () => void;
  user?: AuthUser;
  onLogout?: () => void | Promise<void>;
  onNicknameChanged?: (user: AuthUser) => void;
};

const menuItems = [
  {label:"게임 규칙",description:"헷갈리는 규칙과 조작 찾기",icon:BookOpen},
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
  {label:"꾸미기",description:"보유 스킨과 이미지 이모티콘을 장착합니다",icon:Layers3},
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
  const toolbarRef=useRef<HTMLDivElement>(null),accountRef=useRef<HTMLButtonElement>(null);
  const [toolbarSpace,setToolbarSpace]=useState(350);
  useLayoutEffect(()=>{const node=toolbarRef.current;if(!node)return;const update=()=>setToolbarSpace(Math.ceil(node.getBoundingClientRect().width)+12);update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();},[]);
  const [launchStatus,setLaunchStatus]=useState<HomeLaunchStatus>({kind:'LOADING',reason:'출전 덱을 확인하고 있어요.',editUrl:'/decks'});
  const rewards=useHomeRewardStatus(user?.id);
  const [noticeSeen,setNoticeSeen]=useState<{account:string;version:string}>({account:'',version:''});
  const [allMenusOpen,setAllMenusOpen]=useState(false),[readingOpen,setReadingOpen]=useState(false);
  const [towerEnabled, setTowerEnabled] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [mainContent, setMainContent] = useState<MainContent>(emptyMainContent);
  const [backgroundState, setBackgroundState] = useState<"fallback" | "loading" | "ready">("fallback");
  const [bgmMuted, setBgmMuted] = useState(readStoredBgmMute);
  const [bgmVolume, setBgmVolume] = useState(readStoredBgmVolume);
  const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [logoutPending,setLogoutPending]=useState(false);
  const [accountError,setAccountError]=useState("");
  const logoutLock=useRef(false);
  async function attemptLogout(){
    if(logoutLock.current)return;
    logoutLock.current=true;setLogoutPending(true);setAccountError("");
    try{await onLogout?.();}catch(error){setAccountError(error instanceof Error?error.message:'로그아웃을 확인하지 못했어요. 다시 시도해 주세요.');}
    finally{logoutLock.current=false;setLogoutPending(false);}
  }
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/draft/availability`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : { enabled: false })
      .then(data => { if (!cancelled) setDraftEnabled(data.enabled === true); })
      .catch(() => {});
    return () => { cancelled = true; controller.abort(); };
  }, []);

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
  const latestNotice=latestHomeNotice(mainContent.notices),noticeVersion=homeNoticeVersion(latestNotice);
  const noticeKey=`ko-home-notice-seen-v1:${user?.id??'guest'}`;
  useEffect(()=>{let version='';try{version=localStorage.getItem(noticeKey)??'';}catch{}setNoticeSeen({account:noticeKey,version});},[noticeKey]);
  const hasNewNotice=Boolean(noticeVersion&&noticeSeen.account===noticeKey&&noticeSeen.version!==noticeVersion);
  function openNotices(){setAnnouncementsOpen(true);setNoticeSeen({account:noticeKey,version:noticeVersion});try{localStorage.setItem(noticeKey,noticeVersion);}catch{}}


  function toggleBgm() {
    const next = !bgmMuted;
    setBgmMuted(next);
    audioManager.setBgmMuted(next);
    try { window.localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
  }

  return (
    <main style={{"--home-toolbar-space":toolbarSpace+"px"} as CSSProperties} data-launch-state={launchStatus.kind} className={`ko-home-lobby ko-main-menu ${backgroundUrl ? "ko-main-menu--illustrated" : ""} relative min-h-screen overflow-hidden bg-[#080808] px-5 py-10 text-white sm:px-8`}>
      <div ref={toolbarRef} className="ko-main-menu__toolbar">
      <InstallAppButton />
      <button type="button" onClick={toggleBgm} aria-label={bgmMuted ? "배경음 켜기" : "배경음 음소거"} aria-pressed={bgmMuted} className="relative z-20 flex items-center gap-2 rounded border border-amber-500/50 bg-neutral-950/80 px-3 py-2 text-xs font-bold text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
        {bgmMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {bgmMuted ? "음소거" : "배경음"}
      </button>
      <button type="button" onClick={() => setSoundSettingsOpen((open) => !open)} aria-expanded={soundSettingsOpen}
        className="relative z-20 rounded border border-amber-500/50 bg-neutral-950/80 px-3 py-2 text-xs font-bold text-amber-200">소리 설정</button>
        <button type="button" className="ko-home-settings-link" onClick={()=>navigate("/settings")}>설정</button>
      </div>
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
        <button type="button" className="mt-3 min-h-11 border border-amber-700 px-3 text-sm text-amber-100" onClick={()=>{setSoundSettingsOpen(false);setReadingOpen(true);}}>화면 · 접근성</button>
      </div>}
      <Dialog open={readingOpen} onOpenChange={setReadingOpen}><DialogContent className="max-h-[85dvh] overflow-auto bg-neutral-950 text-white"><DialogTitle>화면 · 접근성</DialogTitle><DialogDescription>글자와 전투 안내를 조절합니다. 설정은 이 기기에 저장됩니다.</DialogDescription><ReadingAccessibilitySettings/></DialogContent></Dialog>
      {backgroundUrl && (
        <div aria-hidden="true" className="ko-main-menu__art pointer-events-none">
          <div className="ko-main-menu__art-fill" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }} />
          <HomeBackgroundImage url={backgroundUrl} placement={mainContent.backgroundPlacement}/>
        </div>
      )}
      {!backgroundUrl&&<div aria-hidden="true" className="ko-home-plain-backdrop font-display">KO</div>}
      <div aria-hidden="true" className="ko-main-menu__shade pointer-events-none absolute inset-0 z-[1]" />
      <div className="ko-main-menu__content relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <header className="ko-main-menu__header text-center">
          <div className="ko-main-menu__brand"><h1 className="ko-main-menu__logo font-display font-black text-white">KO</h1>
          <p className="ko-main-menu__tagline font-display font-bold text-neutral-500">CARD BATTLE</p></div>
          {user && onLogout && (
            <div className="ko-main-menu__user">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button ref={accountRef} type="button" className="ko-home-account" aria-label="계정 메뉴"><span>{user.nickname}</span><ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></button></DropdownMenuTrigger>
                <DropdownMenuContent onCloseAutoFocus={e=>{if(editingNickname)e.preventDefault();}} align="end" className="border-neutral-700 bg-neutral-950 text-neutral-100">
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={()=>{setNicknameDraft(user.nickname);setNicknameError("");setEditingNickname(true);}}><Pencil aria-hidden="true" className="h-4 w-4"/>닉네임 변경</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" onSelect={()=>navigate("/settings")}>계정 · 화면 설정</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 gap-2" disabled={logoutPending} onSelect={()=>void attemptLogout()}><LogOut aria-hidden="true" className="h-4 w-4"/>{logoutPending?"로그아웃 중…":"로그아웃"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ko-home-wallet" aria-label="보유 재화"><span className="text-amber-300">크레딧 {user.isTestAccount ? "∞" : <MotionNumber value={user.currencyBalance} format={n=>n.toLocaleString()} />}</span><span className="text-violet-300">일반 프리즘 {user.isTestAccount ? "∞" : <MotionNumber value={user.prismBalance} format={n=>n.toLocaleString()} />}</span><span className="text-rose-200">챔피언 프리즘 {user.isTestAccount ? "∞" : <MotionNumber value={user.championPrismBalance} format={n=>n.toLocaleString()} />}</span></div>
              {user.isTestAccount&&<span className="ko-main-menu__test-badge" title="테스트 계정 · 전체 카드/챔피언 · 재화 무제한">TEST ACCOUNT</span>}
            </div>
          )}
          <Dialog open={Boolean(user && editingNickname)} onOpenChange={setEditingNickname}><DialogContent onCloseAutoFocus={e=>{e.preventDefault();accountRef.current?.focus({preventScroll:true});}} className="border-neutral-700 bg-neutral-950 text-white"><DialogHeader><DialogTitle>닉네임 변경</DialogTitle><DialogDescription>새 닉네임은 2~16자로 입력해 주세요.</DialogDescription></DialogHeader><form className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-center gap-2" onSubmit={async (event) => {
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
          </form></DialogContent></Dialog>
        </header>

        <Dialog open={Boolean(accountError)} onOpenChange={open=>{if(!open)setAccountError("");}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();accountRef.current?.focus();}} className="border-amber-800 bg-neutral-950 text-white"><DialogHeader><DialogTitle>로그아웃 결과 확인</DialogTitle><DialogDescription className="text-amber-100">{accountError}</DialogDescription></DialogHeader><button type="button" className="min-h-11 rounded border border-amber-600 px-4" onClick={()=>setAccountError("")}>닫기</button></DialogContent></Dialog>
        {mainContent.notices.length > 0 && (
          <section className="ko-main-menu__announcements" aria-label="공지">
            <button type="button" aria-haspopup="dialog" aria-expanded={announcementsOpen} aria-label={`공지 · ${mainContent.notices.length}건`} onClick={openNotices}>
              <span className="ko-home-notice-label">공지</span><span className="ko-home-notice-title">{latestNotice?.title}</span>{hasNewNotice&&<span className="ko-home-notice-new">새 소식</span>}<span aria-hidden="true">▸</span>
            </button>
          </section>
        )}
        <Dialog open={announcementsOpen} onOpenChange={setAnnouncementsOpen}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto border-neutral-700 bg-neutral-950 text-white">
            <DialogHeader><DialogTitle>공지</DialogTitle><DialogDescription>게임 소식과 안내를 확인하세요.</DialogDescription></DialogHeader>
            {mainContent.notices.map(item => <article key={item.id} className="border-l-2 border-amber-400/70 pl-3">
              <h3 className="text-sm font-black">{item.title}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">{item.body}</p>
            </article>)}
          </DialogContent>
        </Dialog>

        {user&&<LaunchDeckBanner key={user.id} accountId={user.id} onStatusChange={setLaunchStatus}/>}
        <section className="ko-home-battle" aria-label="대전 시작">
        <BattleModeButton artwork={mainContent.battleMenuArtwork} onClick={()=>navigate(ROUTES.ONLINE)}/>
        <nav className="ko-home-mode-shortcuts" aria-label="대전 바로 시작"><button type="button" disabled={launchStatus.kind!=="READY"} aria-describedby="home-launch-status" title={launchStatus.reason} onClick={()=>navigate(ROUTES.ONLINE_QUICK)}>빠른 대전 <span>선택 덱으로 시작</span></button><button type="button" disabled={launchStatus.kind!=="READY"} aria-describedby="home-launch-status" title={launchStatus.reason} onClick={()=>onAiMatch?.()}>AI 대전 <span>연습 경기</span></button><button type="button" disabled={!draftEnabled} onClick={()=>navigate('/draft')}>드래프트 <span>{draftEnabled?'카드를 골라 구성':'현재 이용 불가'}</span></button></nav>
        </section>
        <div className="ko-home-secondary">
        <nav className="ko-lobby-shortcuts" aria-label="덱과 꾸미기"><button type="button" onClick={()=>onDeckEdit?.()}>덱 편집</button><button type="button" onClick={()=>navigate(ROUTES.COLLECTION)}>컬렉션</button><button type="button" onClick={()=>navigate('/cosmetics')}>꾸미기</button></nav>
        <nav className="ko-home-learning" aria-label="튜토리얼과 게임 규칙"><button type="button" className="ko-home-tutorial" onClick={()=>navigate('/tutorial')}><BookOpen aria-hidden="true" size={20}/><span><strong>튜토리얼</strong><small>카드로 직접 배우기</small></span><span aria-hidden="true">→</span></button><button type="button" onClick={()=>navigate('/guide')}><span><strong>게임 규칙</strong><small>판정 · 챔피언 토큰</small></span><span aria-hidden="true">→</span></button></nav>
        </div>
        <nav className="ko-home-utility-links" aria-label="보상 바로가기"><button type="button" onClick={()=>navigate('/daily-quests')}>퀘스트</button><button type="button" onClick={()=>navigate('/attendance')}>출석</button><button type="button" onClick={()=>navigate('/packs')}>내 팩</button></nav>
        <button type="button" className="ko-lobby-more" aria-label="보상 · 상점 · 전체 메뉴 ▸" aria-describedby={rewards?.total?'home-reward-count':undefined} onClick={()=>setAllMenusOpen(true)}>보상 · 상점 · 전체 메뉴 ▸{Boolean(rewards?.total)&&<span id="home-reward-count" className="ko-home-reward-count">받을 보상 {rewards!.total}건</span>}</button>
        <Dialog open={allMenusOpen} onOpenChange={setAllMenusOpen}><DialogContent className="ko-lobby-dialog"><DialogTitle>전체 메뉴</DialogTitle><DialogDescription>보상과 계정 기능을 확인하세요.</DialogDescription>
        {Boolean(rewards?.total)&&<aside aria-label="수령 가능한 보상" className="ko-home-reward-links">{Boolean(rewards?.quests)&&<button className="min-h-11" type="button" onClick={()=>navigate('/daily-quests')}>퀘스트 보상 {rewards!.quests}건 받으러 가기 ▸</button>}{Boolean(rewards?.attendance)&&<button className="min-h-11" type="button" onClick={()=>navigate('/attendance')}>출석 보상 받으러 가기 ▸</button>}</aside>}
        <HomePacksShortcut accountId={user?.id}/>
        <section aria-label="메인 메뉴" className="ko-main-menu__groups ko-lobby-all-menus">
          {([{ title: "기타", labels: ["타워 모드"] },
            { title: "덱과 컬렉션", labels: ["덱 편집", "컬렉션", "꾸미기", "내 기록", "튜토리얼", "게임 규칙"] },
            { title: "보상과 상점", labels: ["일일 퀘스트", "출석 보드", "내 팩", "상점"] }]).map(group => <section key={group.title} aria-label={group.title} className="ko-main-menu__group">
          <h2>{group.title}</h2><div className="ko-main-menu__grid">
          {[...menuItems, {label:"내 기록",description:"덱별 전적과 수집 목표",icon:BookOpen}, ...(towerEnabled ? [{ label: '타워 모드', description: '16층 도전에서 덱을 성장시킵니다', icon: Layers3 }] : []), ...(draftEnabled ? [{ label: '드래프트 모드', description: '챔피언과 카드를 선택해 AI 또는 다른 유저와 대결합니다', icon: Layers3 }] : [])].filter(item => group.labels.includes(item.label)).sort((a,b) => group.labels.indexOf(a.label)-group.labels.indexOf(b.label)).map(({ label, description, icon: Icon }, index) => (
            <button
              key={label}
              data-menu-tier={group.title === "대전" ? "battle" : "utility"}
              data-menu-index={index+1}
              title={description}
              aria-description={description}
              type="button"
              data-testid={`button-main-menu-${label === "온라인 매치" ? "online" : label === "AI 매치" ? "ai" : label}`}
              onClick={() => {
                setAllMenusOpen(false);
                if (label === '타워 모드') { navigate('/tower'); return; }
                if (label === '드래프트 모드') { navigate('/draft'); return; }
                if(label==="내 기록"){navigate("/player-notebook");return;}
                if (label === "꾸미기") { navigate("/cosmetics"); return; }
                if (label === "덱 편집") {
                  onDeckEdit?.();
                  return;
                }
                if (label === "AI 매치") {
                  onAiMatch?.();
                  return;
                }
                if(label === "게임 규칙"){navigate("/guide");return;}
                if (label === "튜토리얼") {
                  navigate("/tutorial");
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
          </div></section>)}
        </section></DialogContent></Dialog>
        {notice && (
          <p role="status" className="mt-6 text-center text-sm font-bold text-amber-300">
            {notice}
          </p>
        )}
      </div>
    </main>
  );
}

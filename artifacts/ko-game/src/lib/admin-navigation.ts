export const ADMIN_GROUPS = [
  { id: "home", label: "대시보드", icon: "LayoutDashboard" },
  { id: "cards", label: "카드 관리", icon: "Layers" },
  { id: "champions", label: "챔피언 관리", icon: "Shield" },
  { id: "modes", label: "게임 모드", icon: "Swords" },
  { id: "economy", label: "보상 및 경제", icon: "Coins" },
  { id: "content", label: "콘텐츠 및 미디어", icon: "Image" },
  { id: "users", label: "유저 관리", icon: "Users" },
  { id: "tests", label: "테스트 및 진단", icon: "FlaskConical" },
  { id: "system", label: "시스템 설정", icon: "Settings" },
] as const;
export const ADMIN_PAGES = [
  {
    id: "dashboard",
    group: "home",
    path: "/admin",
    label: "운영 개요",
    description: "현재 설정과 콘텐츠 상태를 확인하고 관리 작업을 시작합니다.",
    keywords: "홈 현황 통계 최근",
  },
  {
    id: "cards",
    group: "cards",
    path: "/admin/cards",
    label: "카드 목록 · 효과",
    description: "선수와 주문의 능력치, 효과, 키워드, 공개 상태를 관리합니다.",
    keywords: "선수 주문 생성 수정 삭제 키워드 일러스트 토큰",
  },
  {
    id: "tags",
    group: "cards",
    path: "/admin/tags",
    label: "태그 관리",
    description: "분류 태그와 연결된 선수 카드를 관리합니다.",
    keywords: "분류 연결",
  },
  {
    id: "skins",
    group: "cards",
    path: "/admin/skins",
    label: "카드 스킨",
    description: "카드 스킨과 일러스트를 관리합니다.",
    keywords: "이미지 외형",
  },
  {
    id: "frames",
    group: "cards",
    path: "/admin/card-frames",
    label: "카드 프레임",
    description: "카드 종류와 등급별 프레임 리소스를 관리합니다.",
    keywords: "희귀도 이미지",
  },
  {
    id: "champions",
    group: "champions",
    path: "/admin/champions",
    label: "챔피언 목록 · 능력",
    description: "고유 능력, 퀘스트, 토큰, 대사와 초상화를 관리합니다.",
    keywords: "강화 보상 감정표현 시작 능력",
  },
  {
    id: "ai-decks",
    group: "modes",
    path: "/admin/ai-decks",
    label: "일반 AI 대전",
    description: "AI 챔피언, 난이도와 실제 대전 덱을 편집합니다.",
    keywords: "쉬움 보통 어려움",
  },
  {
    id: "tower",
    group: "modes",
    path: "/admin/tower",
    label: "타워 모드",
    description: "타워와 층, 보스, 스타터 덱, 유물, 스토리를 제작합니다.",
    keywords: "층 일반 적 보스 유물 컷씬 히든 스타터 공개 테스트",
  },
  {
    id: "draft",
    group: "modes",
    path: "/admin/draft",
    label: "드래프트 모드",
    description: "드래프트 진행과 설정을 관리합니다.",
    keywords: "픽 변이 선택",
  },
  {
    id: "packs",
    group: "economy",
    path: "/admin/packs",
    label: "카드팩",
    description: "카드 풀, 확률, 지급과 개봉 미리보기를 관리합니다.",
    keywords: "확률 뽑기 테스트 지급",
  },
  {
    id: "shop",
    group: "economy",
    path: "/admin/shop",
    label: "상점 · 크레딧",
    description: "판매 상품과 사용자 크레딧 지급을 관리합니다.",
    keywords: "재화 상품 판매 지급",
  },
  {
    id: "prism",
    group: "economy",
    path: "/admin/prism",
    label: "제작 · 프리즘",
    description: "제작·분해 가격과 프리즘 지급·회수를 관리합니다.",
    keywords: "재화 챔피언 중복 보상",
  },
  {
    id: "rewards",
    group: "economy",
    path: "/admin/rewards",
    label: "매치 보상 · 출석",
    description: "온라인 매치 보상과 출석 보드를 설정합니다.",
    keywords: "일일 출석 크레딧 보상",
  },
  {
    id: "quests",
    group: "economy",
    path: "/admin/quests",
    label: "일일 · 시즌 퀘스트",
    description: "퀘스트 조건, 기간, 보상과 진단을 관리합니다.",
    keywords: "목표 배정 시즌 일일 테스트",
  },
  {
    id: "media",
    group: "content",
    path: "/admin/media",
    label: "OST · 배경 · 효과음",
    description: "게임 음악과 배경, 공격 타격음을 관리합니다.",
    keywords: "사운드 이미지 음악 연출",
  },
  {
    id: "notices",
    group: "content",
    path: "/admin/notices",
    label: "공지사항",
    description: "서비스 공지를 작성하고 공개합니다.",
    keywords: "콘텐츠 안내",
  },
  {
    id: "users",
    group: "users",
    path: "/admin/users",
    label: "계정 · 자산 조회",
    description: "기존 사용자 데이터와 자산을 확인하고 지급 도구로 이동합니다.",
    keywords: "유저 닉네임 이메일 계정 자산",
  },
  {
    id: "test",
    group: "tests",
    path: "/admin/test",
    label: "카드 · 챔피언 테스트",
    description: "기존 테스트 게임에서 실제 효과를 확인합니다.",
    keywords: "주문 게임 엔진 AI 테스트",
  },
  {
    id: "tower-test",
    group: "tests",
    path: "/admin/tower-test",
    label: "타워 전투 샌드박스",
    description: "기존 타워 전투 진단 도구를 실행합니다.",
    keywords: "진단 보스 유물",
  },
  {
    id: "system",
    group: "system",
    path: "/admin/system",
    label: "서버 점검",
    description: "일반 이용자의 접근을 제한하는 점검 상태와 안내를 설정합니다.",
    keywords: "서버 운영 권한 유지보수",
  },
] as const;
export type AdminPageId = (typeof ADMIN_PAGES)[number]["id"];
export function adminPageForPath(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, "");
  return (
    ADMIN_PAGES.find((p) => p.path === clean) ||
    (clean === "/admin/dashboard" ? ADMIN_PAGES[0] : undefined)
  );
}
export function searchAdminPages(query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return ADMIN_PAGES.filter((p) =>
    terms.every((t) =>
      `${p.label} ${p.description} ${p.keywords} ${ADMIN_GROUPS.find((g) => g.id === p.group)?.label}`
        .toLocaleLowerCase()
        .includes(t),
    ),
  );
}
export function validAdminPageIds(value: unknown): AdminPageId[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is AdminPageId =>
              typeof id === "string" && ADMIN_PAGES.some((p) => p.id === id),
          ),
        ),
      ].slice(0, 10)
    : [];
}

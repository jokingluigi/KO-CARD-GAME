export const ADMIN_GROUPS = [
  { id: "home", label: "홈", icon: "LayoutDashboard" },
  { id: "cards", label: "카드", icon: "Layers" },
  { id: "champions", label: "챔피언", icon: "Shield" },
  { id: "modes", label: "게임 모드", icon: "Swords" },
  { id: "economy", label: "상점 · 보상", icon: "Coins" },
  { id: "content", label: "꾸미기 · 미디어", icon: "Image" },
  { id: "operations", label: "유저 · 운영", icon: "Users" },
] as const;

type AdminPageEntry = {
  id: string;
  group: (typeof ADMIN_GROUPS)[number]["id"];
  path: string;
  label: string;
  description: string;
  keywords: string;
  /** Opened from another screen (not listed in the menu or search). */
  hidden?: boolean;
};

export const ADMIN_PAGES = [
  { id: "dashboard", group: "home", path: "/admin", label: "홈", description: "자주 하는 일과 최근에 고친 카드·챔피언을 한눈에 봐요.", keywords: "대시보드 운영 개요 현황 최근" },

  { id: "cards", group: "cards", path: "/admin/cards", label: "카드 편집", description: "카드를 만들고 고치면 바로 저장돼요. 효과가 바뀌는 글 수정은 먼저 물어봐요.", keywords: "카드 선수 기술 주문 만들기 수정 효과 글 텍스트 자동 저장 복제 삭제 공개 테스트 키워드 일러스트 토큰" },
  { id: "card-edit", group: "cards", path: "/admin/card-edit", label: "카드 자세히 편집", description: "대사·음악·특수 효과처럼 자세한 설정을 고쳐요. 다 고치면 저장을 눌러 주세요.", keywords: "고급 상세 편집", hidden: true },
  { id: "tags", group: "cards", path: "/admin/tags", label: "태그", description: "태그 이름을 바꾸고, 여러 선수에게 한 번에 붙이거나 떼요.", keywords: "분류 연결 일괄" },
  { id: "frames", group: "cards", path: "/admin/card-frames", label: "카드 프레임", description: "카드 종류와 등급별 테두리 그림을 바꿔요.", keywords: "희귀도 이미지 테두리" },

  { id: "champions", group: "champions", path: "/admin/champions", label: "챔피언 편집", description: "고유 능력, 퀘스트, 토큰, 대사와 초상화를 고쳐요.", keywords: "강화 보상 감정표현 시작 능력 피니셔 테스트" },
  { id: "champion-edit", group: "champions", path: "/admin/champion-edit", label: "챔피언 자세히 편집", description: "능력 효과, 퀘스트 조건, 피니셔, 음성 같은 자세한 설정을 고쳐요. 다 고치면 저장을 눌러 주세요.", keywords: "고급 상세 편집", hidden: true },
  { id: "battle-sprites", group: "champions", path: "/admin/battle-sprites", label: "대전 스프라이트", description: "챔피언·스킨별 대전 그림과 표정을 등록하고 배치를 확인해요.", keywords: "스프라이트 표정 각성 배치 미리보기 스킨" },

  { id: "ai-decks", group: "modes", path: "/admin/ai-decks", label: "AI 대전", description: "AI 챔피언과 대전 덱을 고쳐요.", keywords: "일반 AI 덱 난이도 쉬움 보통 어려움" },
  { id: "bosses", group: "modes", path: "/admin/bosses", label: "보스전", description: "보스, 페이즈, 대화 장면과 첫 클리어 보상을 정해요.", keywords: "보스 스테이지 페이즈 컷씬 대사 대화 레이드" },
  { id: "draft", group: "modes", path: "/admin/draft", label: "드래프트", description: "드래프트 모드를 켜고 끄고, 카드 풀과 규칙을 정해요.", keywords: "픽 변이 선택" },

  { id: "shop", group: "economy", path: "/admin/shop", label: "상점", description: "판매 상품(카드팩)과 완성 덱을 한곳에서 관리해요.", keywords: "상품 판매 가격 크레딧 완성 덱 상점 덱" },
  { id: "packs", group: "economy", path: "/admin/packs", label: "카드팩", description: "카드팩 내용물, 확률, 개봉 미리보기를 정해요.", keywords: "확률 뽑기 테스트 카드 풀" },
  { id: "prism", group: "economy", path: "/admin/prism", label: "제작 가격", description: "카드·챔피언 제작 비용과 분해로 받는 프리즘을 정해요.", keywords: "프리즘 제작 분해 재화 챔피언 중복 보상" },
  { id: "rewards", group: "economy", path: "/admin/rewards", label: "경기 보상 · 출석", description: "튜토리얼·경기 보상과 출석 보드를 정해요.", keywords: "일일 출석 크레딧 보상 튜토리얼 승리 패배" },
  { id: "quests", group: "economy", path: "/admin/quests", label: "퀘스트", description: "일일·시즌 퀘스트의 조건, 기간, 보상을 정해요.", keywords: "목표 배정 시즌 일일 테스트" },

  { id: "cosmetics", group: "content", path: "/admin/cosmetics", label: "스킨 · 이모티콘", description: "스킨·카드 뒷면·이모티콘을 등록하고 계정에 주거나 회수해요.", keywords: "꾸미기 스킨 이모티콘 외형 지급 회수 카드 뒷면" },
  { id: "media", group: "content", path: "/admin/media", label: "음악 · 배경 · 효과음", description: "홈 메뉴 그림, 게임 음악, 배경, 타격음을 바꿔요.", keywords: "OST 사운드 이미지 음악 연출 홈 메뉴" },
  { id: "notices", group: "content", path: "/admin/notices", label: "공지사항", description: "메인 화면에 보일 공지를 쓰고 공개해요.", keywords: "콘텐츠 안내" },

  { id: "users", group: "operations", path: "/admin/users", label: "유저 · 자산 지급", description: "유저를 찾고 크레딧·카드팩·프리즘을 주거나 회수해요.", keywords: "유저 닉네임 이메일 계정 자산 크레딧 지급 카드팩 지급 프리즘 지급 회수" },
  { id: "statistics", group: "operations", path: "/admin/statistics", label: "통계", description: "카드·챔피언 사용률과 승률, 대전 성능을 확인해요.", keywords: "사용 통계 인기 채용률 사용률 승률 선택률 렉 지연 딜레이 성능 p95 멀티플레이" },
  { id: "system", group: "operations", path: "/admin/system", label: "서버 점검 · 관리자", description: "서버 점검을 켜고 끄고, 관리자 계정을 만들어요.", keywords: "서버 운영 권한 유지보수 관리자 계정" },
] as const satisfies readonly AdminPageEntry[];

export type AdminPageId = (typeof ADMIN_PAGES)[number]["id"];
export type AdminPage = (typeof ADMIN_PAGES)[number];

/** Pages shown in the menu and search (hidden pages are opened from another screen). */
export const ADMIN_MENU_PAGES: readonly AdminPage[] = ADMIN_PAGES.filter((p) => !("hidden" in p && p.hidden));

/** Old addresses and saved favorites keep working after pages were merged. */
const LEGACY_PATHS: Record<string, string> = {
  "/admin/dashboard": "/admin",
  "/admin/card-studio": "/admin/cards",
  "/admin/skins": "/admin/cosmetics",
  "/admin/shop-decks": "/admin/shop",
  "/admin/card-statistics": "/admin/statistics",
  "/admin/champion-statistics": "/admin/statistics",
  "/admin/multiplayer-performance": "/admin/statistics",
  "/admin/test": "/admin",
};
const LEGACY_IDS: Record<string, AdminPageId> = {
  skins: "cosmetics",
  "card-studio": "cards",
  "shop-decks": "shop",
  "card-statistics": "statistics",
  "champion-statistics": "statistics",
  "multiplayer-performance": "statistics",
};

export function cleanAdminPath(path: string) {
  return path.split(/[?#]/)[0].replace(/\/$/, "") || "/admin";
}

export function adminPageForPath(path: string): AdminPage | undefined {
  const original = cleanAdminPath(path);
  const clean = LEGACY_PATHS[original] ?? original;
  return ADMIN_PAGES.find((p) => p.path === clean);
}

export function searchAdminPages(query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return ADMIN_MENU_PAGES.filter((p) =>
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
          value
            .map((id) => (typeof id === "string" ? LEGACY_IDS[id] ?? id : id))
            .filter(
              (id): id is AdminPageId =>
                typeof id === "string" && ADMIN_MENU_PAGES.some((p) => p.id === id),
            ),
        ),
      ].slice(0, 10)
    : [];
}

import { useLocation } from "wouter";
const names: Record<string, string> = {
  "/decks": "덱 편집",
  "/collection": "컬렉션",
  "/shop": "상점",
  "/packs": "내 팩",
  "/daily-quests": "퀘스트",
  "/attendance": "출석 보드",
  "/player-notebook": "내 기록",
  "/online/quick": "빠른 대전",
  "/online/friendly": "친선전",
  "/tutorial": "튜토리얼",
  "/ai-match": "AI 대전",
  "/tower": "타워",
  "/draft": "드래프트",
  "/cosmetics": "꾸미기",
  "/online": "대전 모드",
};
export function GameLoading() {
  const [path] = useLocation();
  return (
    <main
      className="ko-loading-screen"
      aria-busy="true"
      aria-label="화면 불러오기"
    >
      <section className="ko-state-panel" role="status">
        <p>KO CARD GAME</p>
        <h1>{names[path] ?? "게임 화면"}</h1>
        <p>화면을 준비하고 있어요…</p>
        <div className="ko-loading-track" aria-hidden="true" />
      </section>
    </main>
  );
}

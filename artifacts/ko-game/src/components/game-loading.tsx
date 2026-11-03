import { useLocation } from "wouter";
import { useEffect, useState } from "react";
const names: Record<string, string> = {
  "/guide":"게임 규칙",
  "/settings":"설정",
  "/account-recovery":"계정 복구",
  "/practice":"플레이 배우기",
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
  const [slowPath, setSlowPath] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(()=>setSlowPath(path), 10000);
    return () => clearTimeout(timer);
  }, [path]);
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
        {slowPath === path && <div className="ko-loading-recovery">
          <p>연결이 늦어지고 있어요. 계속 기다리거나 현재 화면을 다시 불러올 수 있어요.</p>
          <button type="button" className="ko-experience-action" onClick={()=>window.location.reload()}>화면 다시 불러오기</button>
        </div>}
      </section>
    </main>
  );
}

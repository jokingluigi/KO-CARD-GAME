import { Link } from "wouter";
import { GamePageHeader } from "@/components/game-page-header";
import GameGuideContent from "@/components/game-guide/game-guide-content";
export default function GameGuide() {
  return (
    <main className="ko-player-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="플레이 가이드"
          title="게임 도움말"
          description="헷갈리는 규칙과 조작을 검색하고, 필요한 내용만 펼쳐보세요."
          aside={
            <Link
              href="/practice"
              className="ko-surface-action ko-guide-practice-link"
            >
              연습하기 →
            </Link>
          }
        />
        <GameGuideContent />
      </div>
    </main>
  );
}

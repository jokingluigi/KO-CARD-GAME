import { Link } from "wouter";
import { GamePageHeader } from "@/components/game-page-header";
import GameGuideContent from "@/components/game-guide/game-guide-content";
export default function GameGuide() {
  return (
    <main className="ko-player-page ko-guide-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="플레이 가이드"
          title="게임 규칙"
          description="기본 규칙 → 전투 판정 → 챔피언·토큰 → 키워드 순서로 정리했어요. 직접 연습하려면 튜토리얼을 선택하세요."
          aside={
            <Link
              href="/practice"
              className="ko-surface-action ko-guide-practice-link"
            >
              튜토리얼 →
            </Link>
          }
        />
        <GameGuideContent />
      </div>
    </main>
  );
}

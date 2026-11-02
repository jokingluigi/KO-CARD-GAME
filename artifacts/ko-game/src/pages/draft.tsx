import { AdminDraftManager } from "@/components/admin-draft-manager";
import { OnlineAuthGate } from "@/components/online-lobby-ui";
import { GamePageHeader } from "@/components/game-page-header";
import "@/components/draft-entry.css";
export default function Draft() {
  return (
    <OnlineAuthGate>
      {() => (
        <main className="ko-experience-page ko-player-page">
          <div className="ko-page-content">
            <GamePageHeader
              eyebrow="DRAFT ARENA"
              title="드래프트 대전"
              description="챔피언과 카드를 골라, 이번 경기만의 덱을 완성하세요."
              links={[
                { href: "/online", label: "대전 모드" },
                { href: "/draft", label: "드래프트" },
              ]}
            />
            <AdminDraftManager administration={false} />
          </div>
        </main>
      )}
    </OnlineAuthGate>
  );
}

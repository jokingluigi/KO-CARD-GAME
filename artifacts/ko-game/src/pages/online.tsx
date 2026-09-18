import { Shield } from "lucide-react";
import { useLocation } from "wouter";
import { ModeCard, OnlineAuthGate, OnlineShell } from "@/components/online-lobby-ui";
import { ROUTES } from "@/lib/routes";

export default function Online() {
  const [, navigate] = useLocation();
  return (
    <OnlineAuthGate>
      {() => <OnlineShell
        eyebrow="ONLINE BATTLE"
        title="실제 상대와 겨루는 링"
        description="빠르게 상대를 찾거나, 친구와 방 코드를 공유하세요. 전투의 모든 판정은 서버가 담당합니다."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ModeCard
            title="빠른 대전"
            description="유효한 덱을 고르고 FIFO 대기열에서 가장 오래 기다린 상대와 만납니다."
            icon="quick"
            testId="button-online-quick"
            onClick={() => navigate(ROUTES.ONLINE_QUICK)}
          />
          <ModeCard
            title="친선전"
            description="방을 만들고 코드를 공유하거나, 친구가 보낸 코드를 입력해 둘만의 대전을 준비합니다."
            icon="friendly"
            testId="button-online-friendly"
            onClick={() => navigate(ROUTES.ONLINE_FRIENDLY)}
          />
        </div>
        <div className="mt-8 flex items-center gap-3 text-xs font-bold text-neutral-500" data-testid="text-online-safety-note">
          <Shield className="h-4 w-4 text-amber-500" aria-hidden="true" />
          덱 유효성은 입장 직전에 서버에서 다시 확인합니다.
        </div>
      </OnlineShell>}
    </OnlineAuthGate>
  );
}
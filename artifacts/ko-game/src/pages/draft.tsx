import { AdminDraftManager } from '@/components/admin-draft-manager';
import { OnlineAuthGate, OnlineShell } from '@/components/online-lobby-ui';

export default function Draft() {
  return <OnlineAuthGate>{() => (
    <OnlineShell eyebrow="DRAFT MATCH" title="드래프트 대전" description="챔피언과 25장의 카드를 선택해 나만의 덱을 완성하세요. 준비가 끝나면 한 판의 대전이 시작됩니다." backHref="/">
        <AdminDraftManager administration={false} />
    </OnlineShell>
  )}</OnlineAuthGate>;
}

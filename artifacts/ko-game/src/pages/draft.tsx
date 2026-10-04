import { useLocation } from 'wouter';
import { AdminDraftManager } from '@/components/admin-draft-manager';
import { OnlineAuthGate } from '@/components/online-lobby-ui';

export default function Draft() {
  const [, navigate] = useLocation();
  return <OnlineAuthGate>{() => (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <button className="min-h-11 rounded border border-neutral-600 px-4 py-2" onClick={() => navigate('/')}>메인 메뉴</button>
        <AdminDraftManager administration={false} />
      </div>
    </main>
  )}</OnlineAuthGate>;
}

import { useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { installAvailability, promptAppInstallation, subscribeInstallAvailability } from '@/lib/install-app';

export function InstallAppButton() {
  const availability = useSyncExternalStore(subscribeInstallAvailability, installAvailability, () => 'hidden');
  const [showInstructions, setShowInstructions] = useState(false);
  if (availability === 'hidden' || availability === 'installed') return null;

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (availability === 'prompt') {
            void promptAppInstallation().catch(() => setShowInstructions(true));
          } else {
            setShowInstructions((visible) => !visible);
          }
        }}
        aria-expanded={availability === 'instructions' ? showInstructions : undefined}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-500/70 bg-amber-950/50 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        휴대폰에 앱 설치
      </button>
      {showInstructions && (
        <p role="status" className="max-w-xs rounded-lg border border-neutral-700 bg-black/85 px-3 py-2 text-center text-xs leading-5 text-neutral-200">
          안드로이드 Chrome에서 오른쪽 위 ⋮ 메뉴 → <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 누르세요.
        </p>
      )}
    </div>
  );
}

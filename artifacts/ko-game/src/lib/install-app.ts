export type InstallAvailability = 'installed' | 'prompt' | 'instructions' | 'hidden';

type InstallPrompt = Event & { prompt: () => Promise<void> };
let pendingPrompt: InstallPrompt | null = null;
let captureStarted = false;
const subscribers = new Set<() => void>();

function emitChange() {
  subscribers.forEach((notify) => notify());
}

export function installAvailability(): InstallAvailability {
  if (typeof window === 'undefined') return 'hidden';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  if (pendingPrompt) return 'prompt';
  return /Android/i.test(window.navigator.userAgent) ? 'instructions' : 'hidden';
}

export function subscribeInstallAvailability(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

export function startAppInstallation() {
  if (captureStarted || typeof window === 'undefined') return;
  captureStarted = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
    emitChange();
  });
  window.addEventListener('appinstalled', () => {
    pendingPrompt = null;
    emitChange();
  });

  if (import.meta.env.PROD && 'serviceWorker' in window.navigator) {
    window.addEventListener('load', () => {
      const base = import.meta.env.BASE_URL;
      void window.navigator.serviceWorker.register(`${base}service-worker.js`, {
        scope: base,
        updateViaCache: 'none',
      }).catch((error: unknown) => console.warn('앱 설치 지원을 시작하지 못했습니다.', error));
    }, { once: true });
  }
}

export async function promptAppInstallation(): Promise<boolean> {
  const prompt = pendingPrompt;
  if (!prompt) return false;
  pendingPrompt = null;
  emitChange();
  await prompt.prompt();
  return true;
}

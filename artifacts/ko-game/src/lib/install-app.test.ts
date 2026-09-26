import assert from 'node:assert/strict';
import test from 'node:test';
import { installAvailability, promptAppInstallation, startAppInstallation, subscribeInstallAvailability } from './install-app';

test('설치 이벤트를 로그인 전부터 보관하고 버튼 클릭 때 한 번만 사용한다', async () => {
  const browser = new EventTarget() as EventTarget & {
    matchMedia: () => { matches: boolean };
    navigator: { userAgent: string };
  };
  browser.matchMedia = () => ({ matches: false });
  browser.navigator = { userAgent: 'Android Chrome' };
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
  startAppInstallation();
  assert.equal(installAvailability(), 'instructions');

  let prompted = 0;
  let notified = 0;
  const unsubscribe = subscribeInstallAvailability(() => { notified += 1; });
  const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: async () => { prompted += 1; },
  });
  browser.dispatchEvent(installEvent);
  assert.equal(installEvent.defaultPrevented, true);
  assert.equal(installAvailability(), 'prompt');
  assert.equal(await promptAppInstallation(), true);
  assert.equal(await promptAppInstallation(), false);
  assert.equal(prompted, 1);
  assert.equal(installAvailability(), 'instructions');
  assert.equal(notified, 2);
  unsubscribe();
  delete (globalThis as { window?: unknown }).window;
});

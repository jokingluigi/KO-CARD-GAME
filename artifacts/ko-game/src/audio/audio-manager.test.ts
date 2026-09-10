import assert from "node:assert/strict";
import test from "node:test";

import { audioManager } from "./audio-manager";

class FakeAudio {
  volume = 1;
  playbackRate = 1;
  preload = "";
  loop = false;
  currentTime = 0;
  paused = true;
  private listeners = new Map<string, () => void>();

  constructor(readonly url: string) {}

  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

test("공격 SFX는 BGM mute와 독립된 오디오 채널을 사용한다", () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    },
  });

  try {
    audioManager.stopAttack();
    audioManager.stopBgm();
    audioManager.playAttack("/attack.mp3", 65, 1.06);
    const attackAudio = (audioManager as unknown as { attackAudio: FakeAudio | null }).attackAudio;
    assert.ok(attackAudio);
    assert.equal(attackAudio.volume, 0.65);
    assert.equal(attackAudio.playbackRate, 1.06);

    audioManager.playBgm("/bgm.mp3", 80);
    audioManager.setBgmMuted(true);
    const bgmAudio = (audioManager as unknown as {
      bgm: { audio: FakeAudio } | null;
    }).bgm?.audio;
    assert.ok(bgmAudio);
    assert.equal(bgmAudio.volume, 0);
    assert.equal(attackAudio.volume, 0.65);
  } finally {
    audioManager.stopAttack();
    audioManager.stopBgm();
    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: previousAudio,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});
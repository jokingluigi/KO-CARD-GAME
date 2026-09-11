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

  emit(name: string) {
    this.listeners.get(name)?.();
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

test("음악은 0에서 fade-in되고 공격 SFX는 BGM mute와 독립된 채널을 사용한다", () => {
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
    const baseMusic = (audioManager as unknown as {
      bgm: { audio: FakeAudio } | null;
    }).bgm?.audio;
    assert.ok(baseMusic);
    assert.equal(baseMusic.volume, 0);
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

test("등장 음악 뒤에는 가장 최근 Quest 음악 base로 복귀한다", () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, setTimeout, clearTimeout },
  });

  try {
    audioManager.stopBgm();
    audioManager.setBgmMuted(false);
    audioManager.playBgm("/match.mp3", 70);
    audioManager.playCardEntrance("/entrance.mp3", 90);
    audioManager.playQuestComplete("/quest.mp3", 85);

    const manager = audioManager as unknown as {
      current: { audio: FakeAudio } | null;
      bgm: { audio: FakeAudio; url: string } | null;
    };
    assert.equal(manager.current?.audio.url, "/entrance.mp3");
    assert.equal(manager.bgm?.url, "/quest.mp3");
    assert.equal(manager.current?.audio.volume, 0);

    manager.current?.audio.emit("ended");
    assert.equal(manager.current, null);
    assert.equal(manager.bgm?.url, "/quest.mp3");
    assert.equal(manager.bgm?.audio.paused, false);
    assert.equal(manager.bgm?.audio.volume, 0);

    audioManager.stopBgm();
    assert.equal((audioManager as unknown as { current: unknown }).current, null);
    assert.equal((audioManager as unknown as { bgm: unknown }).bgm, null);
  } finally {
    audioManager.stopBgm();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
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

function withFakeAudio(testBody: (advance: (milliseconds: number) => void) => void) {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  const previousDateNow = Date.now;
  let now = 0;
  let nextTimerId = 1;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, { callback: () => void; due: number }>();
  const fakeWindow = {
    setInterval(callback: () => void) {
      const id = nextTimerId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id: number) {
      intervals.delete(id);
    },
    setTimeout(callback: () => void, delay: number) {
      const id = nextTimerId++;
      timeouts.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id: number) {
      timeouts.delete(id);
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(Date, "now", { configurable: true, value: () => now });

  const advance = (milliseconds: number) => {
    now += milliseconds;
    for (const [id, timer] of [...timeouts]) {
      if (timer.due <= now) {
        timeouts.delete(id);
        timer.callback();
      }
    }
    for (const callback of [...intervals.values()]) callback();
  };

  try {
    testBody(advance);
  } finally {
    audioManager.stopGameAudio();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(Date, "now", { configurable: true, value: previousDateNow });
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

test("같은 메인 BGM을 다시 적용해도 audio instance를 중복 생성하지 않는다", () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, setTimeout, clearTimeout },
  });

  try {
    audioManager.stopBgm();
    audioManager.playBgm("/main.mp3", 70);
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio } | null;
    };
    const first = manager.bgm?.audio;
    audioManager.playBgm("/main.mp3", 55);
    assert.equal(manager.bgm?.audio, first);
    assert.equal(manager.bgm?.volume, 55);
  } finally {
    audioManager.stopBgm();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("팩 희귀 Reveal 음악은 중앙 채널에서 시작하고 명시적으로 cleanup된다", () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, setTimeout, clearTimeout },
  });

  try {
    audioManager.stopBgm();
    audioManager.playPackRevealMusic("/legendary.mp3", 90, {
      maxDuration: 7000,
      fadeInMs: 600,
      fadeOutMs: 800,
    });
    const manager = audioManager as unknown as {
      packReveal: { audio: FakeAudio } | null;
    };
    assert.equal(manager.packReveal?.audio.url, "/legendary.mp3");
    assert.equal(manager.packReveal?.audio.volume, 0);
    audioManager.stopPackRevealMusic();
    assert.equal(manager.packReveal, null);
  } finally {
    audioManager.stopBgm();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("Legendary 등장 음악은 persistent 음악의 재생 위치를 보존하고 같은 인스턴스를 resume한다", () => {
  withFakeAudio((advance) => {
    audioManager.setBgmMuted(false);
    audioManager.playBgm("/quest-a.mp3", 80);
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio; url: string } | null;
      current: { audio: FakeAudio } | null;
    };
    const persistent = manager.bgm?.audio;
    assert.ok(persistent);
    assert.equal(persistent.loop, true);
    advance(600);
    persistent.currentTime = 102;

    audioManager.playLegendaryEntrance("/legendary.mp3", 95);
    assert.equal(persistent.paused, true);
    assert.equal(persistent.currentTime, 102);
    assert.equal(manager.current?.audio.url, "/legendary.mp3");

    advance(6_200);
    assert.equal(manager.current?.audio.url, "/legendary.mp3");
    assert.equal(persistent.paused, true);
    advance(800);

    assert.equal(manager.current, null);
    assert.equal(manager.bgm?.audio, persistent);
    assert.equal(manager.bgm?.audio.currentTime, 102);
    assert.equal(manager.bgm?.audio.paused, false);
  });
});

test("Legendary 중 새 Quest가 완료되면 이전 paused track 대신 최신 Quest를 재생한다", () => {
  withFakeAudio((advance) => {
    audioManager.playBgm("/quest-a.mp3", 80);
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio; url: string } | null;
      current: { audio: FakeAudio } | null;
    };
    const questA = manager.bgm?.audio;
    assert.ok(questA);
    questA.currentTime = 50;

    audioManager.playLegendaryEntrance("/legendary.mp3", 95);
    audioManager.playQuestComplete("/quest-b.mp3", 85);
    assert.equal(manager.bgm?.url, "/quest-b.mp3");
    assert.notEqual(manager.bgm?.audio, questA);

    advance(6_200);
    advance(800);
    assert.equal(manager.current, null);
    assert.equal(manager.bgm?.url, "/quest-b.mp3");
    assert.equal(manager.bgm?.audio.paused, false);
    assert.equal(questA.paused, true);
    assert.equal(questA.currentTime, 0);
  });
});

test("오래된 Legendary callback은 새 override를 종료하거나 persistent 음악을 재생하지 않는다", () => {
  withFakeAudio((advance) => {
    audioManager.playBgm("/match.mp3", 80);
    audioManager.playLegendaryEntrance("/legendary-a.mp3", 95);
    const manager = audioManager as unknown as {
      current: { audio: FakeAudio } | null;
    };
    const first = manager.current?.audio;
    assert.ok(first);

    audioManager.playLegendaryEntrance("/legendary-b.mp3", 95);
    first.emit("ended");
    advance(6_200);

    assert.equal(manager.current?.audio.url, "/legendary-b.mp3");
  });
});
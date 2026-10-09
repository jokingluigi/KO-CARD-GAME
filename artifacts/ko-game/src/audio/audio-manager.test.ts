import assert from "node:assert/strict";
import test from "node:test";

import { audioManager } from "./audio-manager";

class FakeAudio {
  static rejectPlay = false;
  static failLoad = false;
  static delayPlay = false;
  error: MediaError | null = null;
  volume = 1;
  muted = false;
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
    if (FakeAudio.failLoad) {
      this.error = { code: 4 } as MediaError;
      this.paused = true;
      this.emit("error");
      return Promise.reject(new DOMException("Missing media", "NotSupportedError"));
    }
    if (FakeAudio.rejectPlay) {
      this.paused = true;
      return Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    }
    if (FakeAudio.delayPlay) return new Promise<void>(() => {});
    this.paused = false;
    this.emit("playing");
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

test("effect volume changes attack sounds independently of the BGM", () => {
  withFakeAudio(() => {
    audioManager.setSfxVolume(25);
    audioManager.playAttack("/attack.mp3", 80);
    const attack = (audioManager as unknown as { attackAudio: FakeAudio | null }).attackAudio;
    assert.equal(attack?.volume, 0.2);
    audioManager.setSfxVolume(0);
    assert.equal(attack?.volume, 0);
    audioManager.setSfxVolume(100);
    assert.equal(attack?.volume, 0.8);
  });
});

test("admin silence cancels playing and pending music and ignores late background loads", () => {
  withFakeAudio(advance => {
    audioManager.setBgmMuted(false);
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.playBgm("/menu.mp3", 80);
    advance(600);
    const previous = (audioManager as any).bgm.audio as FakeAudio;
    audioManager.playBgm("/next-menu.mp3", 80);
    audioManager.setMusicContext("SILENT");
    assert.equal(previous.paused, true);
    assert.equal((audioManager as any).bgm, null);
    audioManager.playBgm("/late-menu.mp3", 80);
    audioManager.playMatchBgm("/late-battle.mp3", 80);
    audioManager.unlockAudio();
    advance(2000);
    assert.equal((audioManager as any).bgm, null);
    assert.equal((audioManager as any).pendingBaseMusic, null);
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.playBgm("/return-menu.mp3", 80);
    advance(600);
    assert.equal((audioManager as any).bgm.audio.paused, false);
  });
});

test("admin explicit audio preview works without restoring automatic background music", () => {
  withFakeAudio(advance => {
    audioManager.setMusicContext("SILENT");
    audioManager.previewBgm("/preview.mp3", 80);
    assert.equal((audioManager as any).current.audio.paused, false);
    assert.equal((audioManager as any).bgm, null);
    advance(11000);
    assert.equal((audioManager as any).bgm, null);
    audioManager.stopBgm();
    audioManager.setMusicContext("NON_BATTLE");
  });
});

test("음소거 상태에서 모드가 바뀌고 새 배경음이 로드되어도 음악이 들리지 않는다", () => {
  withFakeAudio(() => {
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.setBgmMuted(true);
    audioManager.playBgm("/menu.mp3", 80);
    const first = (audioManager as unknown as { bgm: { audio: FakeAudio } | null }).bgm?.audio;
    assert.equal(first?.muted, true);
    audioManager.setMusicContext("BATTLE");
    audioManager.playMatchBgm("/match.mp3", 80);
    const second = (audioManager as unknown as { bgm: { audio: FakeAudio } | null }).bgm?.audio;
    assert.equal(second?.muted, true);
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.playBgm("/menu.mp3", 80);
    const returned = (audioManager as unknown as { bgm: { audio: FakeAudio } | null }).bgm?.audio;
    assert.equal(returned?.muted, true);
    audioManager.setBgmMuted(false);
    assert.equal(returned?.muted, false);
  });
});

test('카드 등장 볼륨은 타격 효과음 볼륨과 독립적으로 조절된다', () => {
  withFakeAudio((advance) => {
    audioManager.setEntranceVolume(40);
    audioManager.setSfxVolume(20);
    audioManager.playCardEntrance('/entrance.mp3', 80);
    advance(600);
    const entrance = (audioManager as unknown as { current: { audio: FakeAudio } | null }).current?.audio;
    assert.equal(entrance?.volume, 0.32);
    audioManager.setSfxVolume(0);
    assert.equal(entrance?.volume, 0.32);
    audioManager.setEntranceVolume(50);
    assert.equal(entrance?.volume, 0.4);
    audioManager.setEntranceVolume(100);
    audioManager.setSfxVolume(100);
  });
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
    audioManager.setMusicContext("BATTLE");
    audioManager.playMatchBgm("/match.mp3", 70);
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

test("autoplay 거부 뒤에도 base 인스턴스를 보존하고 앱 unlock에서 같은 트랙을 재시도한다", async () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, setTimeout, clearTimeout },
  });

  try {
    audioManager.stopBgm();
    audioManager.setMusicContext("NON_BATTLE");
    FakeAudio.rejectPlay = true;
    audioManager.playBgm("/blocked.mp3", 80);
    await Promise.resolve();
    await Promise.resolve();
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio; url: string } | null;
    };
    assert.equal(manager.bgm?.url, "/blocked.mp3");
    assert.equal(audioManager.isAudioUnlockPending(), true);

    FakeAudio.rejectPlay = false;
    audioManager.unlockAudio();
    await Promise.resolve();
    assert.equal(manager.bgm?.audio.paused, false);
    assert.equal(audioManager.isAudioUnlockPending(), false);
  } finally {
    FakeAudio.rejectPlay = false;
    audioManager.stopBgm();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("missing BGM assets are reported as media errors, not autoplay locks", async () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  const previousWarn = console.warn;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setInterval, clearInterval, setTimeout, clearTimeout },
  });

  try {
    audioManager.stopBgm();
    audioManager.setMusicContext("NON_BATTLE");
    FakeAudio.rejectPlay = false;
    FakeAudio.failLoad = true;
    console.warn = () => {};
    audioManager.playBgm("/missing.mp3", 80);
    await Promise.resolve();
    await Promise.resolve();
    const manager = audioManager as unknown as {
      bgm: { failedToLoad: boolean } | null;
    };
    assert.equal(manager.bgm?.failedToLoad, true);
    assert.equal(audioManager.isAudioUnlockPending(), false);
  } finally {
    FakeAudio.failLoad = false;
    audioManager.stopBgm();
    console.warn = previousWarn;
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("비전투 경로 전환은 같은 base audio 인스턴스와 재생 위치를 유지한다", () => {
  withFakeAudio(() => {
    audioManager.playBgm("/persistent.mp3", 80);
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio } | null;
    };
    const first = manager.bgm?.audio;
    assert.ok(first);
    first.currentTime = 42;
    audioManager.setMusicContext("BATTLE");
    assert.equal(first.paused, true);
    audioManager.setMusicContext("NON_BATTLE");
    assert.equal(manager.bgm?.audio, first);
    assert.equal(first.currentTime, 42);
  });
});

test("전투 선택 BGM은 전투 경로에서 재생되고 메인 BGM은 전투 중 정지한다", () => {
  withFakeAudio(() => {
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.playBgm("/title.mp3", 80);
    const manager = audioManager as unknown as {
      bgm: { audio: FakeAudio; url: string; scope: string } | null;
    };
    const titleMusic = manager.bgm?.audio;
    assert.ok(titleMusic);
    assert.equal(titleMusic.paused, false);
    assert.equal(manager.bgm?.scope, "NON_BATTLE");

    audioManager.setMusicContext("BATTLE");
    assert.equal(titleMusic.paused, true);

    audioManager.playBgm("/misrouted-match.mp3", 70);
    assert.equal(manager.bgm?.scope, "NON_BATTLE");
    assert.equal(manager.bgm?.audio.paused, true);

    audioManager.playMatchBgm("/match.mp3", 70);
    const matchMusic = manager.bgm?.audio;
    assert.ok(matchMusic);
    assert.equal(manager.bgm?.scope, "BATTLE");
    assert.equal(matchMusic.paused, false);

    audioManager.setMusicContext("NON_BATTLE");
    assert.equal(matchMusic.paused, true);
    audioManager.playBgm("/title.mp3", 80);
    assert.equal(manager.bgm?.scope, "NON_BATTLE");
    assert.equal(manager.bgm?.audio.paused, false);
  });
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
    assert.equal(manager.current?.audio.loop, true);
    assert.equal(persistent.paused, true);
    assert.equal(persistent.currentTime, 102);
    assert.equal(manager.current?.audio.url, "/legendary.mp3");

    advance(10_000);
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
    audioManager.setMusicContext("BATTLE");
    audioManager.playMatchBgm("/quest-a.mp3", 80);
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

    advance(10_000);
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
    advance(10_000);

    assert.equal(manager.current?.audio.url, "/legendary-b.mp3");
  });
});

test('finisher sound keeps priority until expiry and overlays remain bounded',()=>{
 withFakeAudio(advance=>{
  const manager=audioManager as unknown as {attackAudio:FakeAudio|null;overlays:Set<FakeAudio>};
  audioManager.playAttack('/combat-finisher.wav',80);
  const finishing=manager.attackAudio;
  audioManager.playAttack('/impact-light.wav',80);
  audioManager.playImpactOverlay('/ui.wav',50);
  assert.equal(manager.attackAudio,finishing);assert.equal(manager.overlays.size,0);
  audioManager.playImpactOverlay('/glass.wav',80,9);
  assert.equal(manager.overlays.size,1);
  advance(700);
  audioManager.playAttack('/impact-light.wav',80);
  assert.notEqual(manager.attackAudio,finishing);
  advance(200);
  for(let i=0;i<9;i++)audioManager.playImpactOverlay('/overlay-'+i,50);
  assert.equal(manager.overlays.size,4);
  audioManager.stopAttack();assert.equal(manager.overlays.size,0);
 });
});
test('weaker duck never lifts a finisher early and restores the same music position',()=>{
 withFakeAudio(advance=>{
  audioManager.setMusicContext('BATTLE');audioManager.setBgmMuted(false);audioManager.setBgmVolume(100);
  audioManager.playMatchBgm('/duck-match.mp3',80);advance(1000);
  const manager=audioManager as unknown as {bgm:{audio:FakeAudio}};
  const audio=manager.bgm.audio;audio.currentTime=42;
  audioManager.duckForPresentation(.3,700);assert.equal(audio.volume,.24);
  advance(100);audioManager.duckForPresentation(.7,100);assert.equal(audio.volume,.24);
  advance(150);assert.equal(audio.volume,.24);
  advance(500);assert.equal(audio.volume,.8);assert.equal(audio.currentTime,42);assert.equal(audio.paused,false);
 });
});


test("first-entry match cleanup preserves menu music and playback position", () => {
  withFakeAudio(() => {
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.setBgmMuted(false);
    audioManager.playBgm("/menu-entry.mp3", 80);
    const manager = audioManager as unknown as { bgm: { audio: FakeAudio } | null };
    const menu = manager.bgm!.audio;
    menu.currentTime = 12;
    audioManager.stopBattleAudio();
    assert.equal(manager.bgm?.audio, menu);
    assert.equal(menu.paused, false);
    assert.equal(menu.currentTime, 12);
    audioManager.setMusicContext("BATTLE");
    audioManager.playMatchBgm("/battle.mp3", 70);
    audioManager.stopBattleAudio();
    assert.equal(manager.bgm, null);
  });
});

test("first-entry cleanup retains blocked menu audio for the first user gesture", async () => {
  const previousAudio = globalThis.Audio;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setInterval, clearInterval, setTimeout, clearTimeout } });
  try {
    audioManager.setMusicContext("NON_BATTLE");
    audioManager.setBgmMuted(false);
    FakeAudio.rejectPlay = true;
    audioManager.playBgm("/first-gesture.mp3", 80);
    await Promise.resolve(); await Promise.resolve();
    audioManager.stopBattleAudio();
    assert.equal(audioManager.isAudioUnlockPending(), true);
    FakeAudio.rejectPlay = false;
    audioManager.unlockAudio();
    await Promise.resolve();
    const manager = audioManager as unknown as { bgm: { audio: FakeAudio } | null };
    assert.equal(manager.bgm?.audio.paused, false);
  } finally {
    FakeAudio.rejectPlay = false;
    audioManager.stopGameAudio();
    Object.defineProperty(globalThis, "Audio", { configurable: true, value: previousAudio });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});


test("slow legendary loading preserves a full ten seconds after playback starts", () => {
  withFakeAudio(advance => {
    const manager = audioManager as unknown as { current: { audio: FakeAudio } | null; bgm: {audio: FakeAudio} };
    audioManager.setBgmMuted(false);
    audioManager.playBgm('/slow-base.mp3', 80);
    const base = manager.bgm.audio;
    base.currentTime = 27;
    FakeAudio.delayPlay = true;
    try {
      audioManager.playLegendaryEntrance('/slow-legendary.mp3', 100);
      advance(12_000);
      assert.ok(manager.current, 'loading must not exhaust the entrance duration');
      manager.current.audio.paused = false;
      manager.current.audio.emit('playing');
      advance(9_900);
      assert.ok(manager.current);
      assert.equal(base.paused, true);
      advance(100); advance(800);
      assert.equal(manager.current, null);
      assert.equal(base.currentTime, 27);
    } finally { FakeAudio.delayPlay = false; }
  });
});

test("unresponsive legendary media releases the paused base at the loading deadline", () => {
  withFakeAudio(advance => {
    const manager = audioManager as unknown as { current: unknown; bgm: {audio: FakeAudio} };
    audioManager.playBgm('/fallback-base.mp3', 80);
    FakeAudio.delayPlay = true;
    try {
      audioManager.playLegendaryEntrance('/never-loads.mp3', 100);
      advance(30_000);
      assert.equal(manager.current, null);
      // The pending fake flag also blocks base replay; the base instance itself survives.
      assert.equal(manager.bgm.audio.url, '/fallback-base.mp3');
    } finally { FakeAudio.delayPlay = false; }
  });
});

test("blocked legendary entrance retries the same media on the next user gesture", async () => {
  const previousAudio = globalThis.Audio, previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'Audio', {configurable:true,value:FakeAudio});
  Object.defineProperty(globalThis, 'window', {configurable:true,value:{setInterval,clearInterval,setTimeout,clearTimeout}});
  const manager = audioManager as unknown as {current: {audio: FakeAudio} | null};
  try {
    FakeAudio.rejectPlay = true;
    audioManager.playLegendaryEntrance('/blocked-legendary.mp3', 100);
    const original = manager.current!.audio;
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(audioManager.isAudioUnlockPending(), true);
    assert.equal(manager.current?.audio, original);
    FakeAudio.rejectPlay = false;
    audioManager.unlockAudio();
    await Promise.resolve();
    assert.equal(original.paused, false);
    assert.equal(audioManager.isAudioUnlockPending(), false);
  } finally {
    FakeAudio.rejectPlay = false; audioManager.stopGameAudio();
    Object.defineProperty(globalThis, 'Audio', {configurable:true,value:previousAudio});
    Object.defineProperty(globalThis, 'window', {configurable:true,value:previousWindow});
  }
});

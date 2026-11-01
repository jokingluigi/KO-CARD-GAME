import test from "node:test";
import assert from "node:assert/strict";
import { audioManager } from "./audio-manager";
test("an old rejected play promise cannot clear a newer use of the same cached sound; stop removes listeners", async () => {
  const priorAudio = globalThis.Audio,
    priorWindow = globalThis.window;
  const plays: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  class AudioStub {
    volume = 1;
    currentTime = 0;
    playbackRate = 1;
    preload = "";
    paused = true;
    listeners = new Set<() => void>();
    constructor(readonly url: string) {}
    load() {}
    pause() {
      this.paused = true;
    }
    addEventListener(_name: string, fn: () => void) {
      this.listeners.add(fn);
    }
    removeEventListener(_name: string, fn: () => void) {
      this.listeners.delete(fn);
    }
    play() {
      this.paused = false;
      return new Promise<void>((resolve, reject) =>
        plays.push({ resolve, reject }),
      );
    }
  }
  Object.defineProperty(globalThis, "Audio", {
    value: AudioStub,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { setTimeout, clearTimeout, setInterval, clearInterval },
    configurable: true,
  });
  try {
    audioManager.preloadAttackSounds(["/qa-race-attack.wav"]);
    audioManager.playAttack("/qa-race-attack.wav", 80);
    const manager = audioManager as unknown as {
      attackAudio: AudioStub | null;
    };
    const sound = manager.attackAudio!;
    audioManager.playAttack("/qa-race-attack.wav", 80);
    assert.equal(manager.attackAudio, sound);
    assert.equal(sound.listeners.size, 1);
    plays[0].reject(Error("old interruption"));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(manager.attackAudio, sound);
    plays[1].resolve();
    audioManager.stopAttack();
    assert.equal(sound.listeners.size, 0);
    assert.equal(manager.attackAudio, null);
  } finally {
    audioManager.stopGameAudio();
    Object.defineProperty(globalThis, "Audio", {
      value: priorAudio,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: priorWindow,
      configurable: true,
    });
  }
});

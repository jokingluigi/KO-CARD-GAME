export const AUDIO_STINGER_DURATION = 10;
export const AUDIO_FADE_IN_DURATION = 0.5;
export const AUDIO_FADE_OUT_DURATION = 0.8;
export const LEGENDARY_ENTRANCE_DURATION = 7;
export const LEGENDARY_ENTRANCE_FADE_OUT = 0.8;
export const PACK_REVEAL_MAX_DURATION = 7000;
export const PACK_REVEAL_FADE_IN = 600;
export const PACK_REVEAL_FADE_OUT = 800;

type TemporaryAudioKind = "CARD_ENTRANCE" | "LEGENDARY_ENTRANCE" | "PREVIEW";
type AudioRequest = {
  url: string;
  volume: number;
  kind: TemporaryAudioKind;
};

type MusicAudio = {
  audio: HTMLAudioElement;
  url: string;
  volume: number;
  scope: "NON_BATTLE" | "BATTLE";
  failedToLoad: boolean;
  fadeTimerId: number | null;
};

function safeVolume(volume: number) {
  return Math.min(1, Math.max(0, volume / 100));
}

function hasBrowserAudio() {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

class AudioManager {
  private current: {
    audio: HTMLAudioElement;
    request: AudioRequest;
    fadeTimerId: number | null;
    fadeOutTimerId: number | null;
    timeoutId: number;
  } | null = null;
  private queue: AudioRequest[] = [];
  /**
   * `bgm` is the current persistent base music. It is intentionally kept as
   * this name because the mute and media preview APIs are BGM-compatible even
   * when the base is a completed Champion's music.
   */
  private bgm: MusicAudio | null = null;
  private pendingBaseMusic: {
    url: string;
    volume: number;
    scope: "NON_BATTLE" | "BATTLE";
  } | null = null;
  private baseTransitionId = 0;
  private bgmMuted = false;
  private bgmVolume = 100;
  private needsAudioUnlock = false;
  private musicContext: "NON_BATTLE" | "BATTLE" = "NON_BATTLE";
  private attackAudio: HTMLAudioElement | null = null;
  private packReveal: {
    audio: HTMLAudioElement;
    timeoutId: number;
    fadeTimerId: number | null;
  } | null = null;
  private packRevealTransitionId = 0;

  playCardEntrance(url: string, volume: number) {
    this.enqueue({ url, volume, kind: "CARD_ENTRANCE" });
  }

  playLegendaryEntrance(url: string, volume: number) {
    if (!hasBrowserAudio() || !url) return;
    this.queue = [];
    this.stopTemporary(false);
    this.startTemporary(
      { url, volume, kind: "LEGENDARY_ENTRANCE" },
      {
        durationMs: LEGENDARY_ENTRANCE_DURATION * 1000,
        fadeOutMs: LEGENDARY_ENTRANCE_FADE_OUT * 1000,
        pauseBase: true,
      },
    );
  }

  playPackRevealMusic(
    url: string,
    volume: number,
    options: { maxDuration?: number; fadeInMs?: number; fadeOutMs?: number } = {},
  ) {
    if (!hasBrowserAudio() || !url) return;
    const transitionId = ++this.packRevealTransitionId;
    this.stopTemporary(false);
    const previous = this.packReveal;
    const start = () => {
      if (transitionId !== this.packRevealTransitionId) return;
      this.startPackRevealMusic(url, volume, {
        maxDuration: options.maxDuration ?? PACK_REVEAL_MAX_DURATION,
        fadeInMs: options.fadeInMs ?? PACK_REVEAL_FADE_IN,
        fadeOutMs: options.fadeOutMs ?? PACK_REVEAL_FADE_OUT,
      }, transitionId);
    };
    if (!previous) {
      start();
      return;
    }
    this.fadeOutPackReveal(previous, Math.min(options.fadeOutMs ?? PACK_REVEAL_FADE_OUT, 220), start);
  }

  stopPackRevealMusic() {
    this.packRevealTransitionId += 1;
    const current = this.packReveal;
    if (!current) {
      this.resumeBaseMusic();
      return;
    }
    if (current.fadeTimerId !== null) window.clearInterval(current.fadeTimerId);
    window.clearTimeout(current.timeoutId);
    current.audio.pause();
    current.audio.currentTime = 0;
    this.packReveal = null;
    this.resumeBaseMusic();
  }

  /** Replaces the persistent base without interrupting a card entrance. */
  playQuestComplete(url: string, volume: number) {
    this.setBaseMusic(url, volume, "BATTLE");
  }

  preview(url: string, volume: number) {
    this.stop();
    this.startTemporary({ url, volume, kind: "PREVIEW" });
  }

  playBgm(url: string, volume: number) {
    this.setBaseMusic(url, volume, "NON_BATTLE");
  }

  /** Plays the match-selected base while the route is in a battle context. */
  playMatchBgm(url: string, volume: number) {
    this.setBaseMusic(url, volume, "BATTLE");
  }

  previewBgm(url: string, volume: number) {
    this.playBgm(url, volume);
  }

  playAttack(url: string, volume: number, pitch = 1) {
    if (!hasBrowserAudio() || !url) return;
    this.stopAttack();
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = safeVolume(volume);
      audio.playbackRate = Math.max(0.8, Math.min(1.25, pitch));
      this.attackAudio = audio;
      audio.addEventListener("ended", () => {
        if (this.attackAudio === audio) this.attackAudio = null;
      }, { once: true });
      audio.play().catch(() => {
        if (this.attackAudio === audio) this.attackAudio = null;
      });
    } catch {
      this.attackAudio = null;
    }
  }

  previewAttack(url: string, volume: number) {
    this.playAttack(url, volume);
  }

  stopAttack() {
    if (!this.attackAudio) return;
    this.attackAudio.pause();
    this.attackAudio.currentTime = 0;
    this.attackAudio = null;
  }

  setBgmVolume(volume: number) {
    this.bgmVolume = Math.min(100, Math.max(0, Number.isFinite(volume) ? volume : 100));
    if (!this.bgm || this.bgmMuted) return;
    this.bgm.audio.volume = safeVolume(this.bgm.volume * this.bgmVolume / 100);
  }

  setBgmMuted(muted: boolean) {
    this.bgmMuted = muted;
    if (this.bgm) {
      this.bgm.audio.volume = muted
        ? 0
        : safeVolume(this.bgm.volume * this.bgmVolume / 100);
      if (!muted) this.reconcileBgmPlayback();
    }
  }

  isBgmMuted() {
    return this.bgmMuted;
  }

  getBgmVolume() {
    return this.bgmVolume;
  }

  setMusicContext(context: "NON_BATTLE" | "BATTLE") {
    this.musicContext = context;
    if (this.bgm && this.bgm.scope !== context) {
      this.bgm?.audio.pause();
      return;
    }
    this.reconcileBgmPlayback();
  }

  unlockAudio() {
    if (this.bgmMuted) return;
    this.reconcileBgmPlayback();
  }

  isAudioUnlockPending() {
    return this.needsAudioUnlock;
  }

  /** Stops both the persistent base and any temporary entrance music. */
  stopBgm() {
    this.stopPackRevealMusic();
    this.stopTemporary(false);
    this.queue = [];
    this.stopBaseMusic();
  }

  /** Clears every game-owned music/effect handle when leaving a match route. */
  stopGameAudio() {
    this.stopBgm();
    this.stopAttack();
  }

  stop() {
    this.stopTemporary(false);
    this.queue = [];
  }

  private setBaseMusic(
    url: string,
    volume: number,
    scope: "NON_BATTLE" | "BATTLE",
  ) {
    if (!hasBrowserAudio() || !url) return;
    if (this.bgm?.url === url) {
      this.bgm.volume = volume;
      this.bgm.scope = scope;
      if (this.musicContext !== scope) {
        this.bgm.audio.pause();
        return;
      }
      if (this.bgmMuted) {
        this.bgm.audio.volume = 0;
        return;
      }
      if (!this.current) {
        this.bgm.audio.volume = safeVolume(volume * this.bgmVolume / 100);
        this.reconcileBgmPlayback();
      }
      return;
    }

    const previous = this.bgm;
    this.pendingBaseMusic = { url, volume, scope };
    const transitionId = ++this.baseTransitionId;
    if (!previous) {
      this.commitPendingBaseMusic(transitionId);
      return;
    }

    if (previous.fadeTimerId !== null) window.clearInterval(previous.fadeTimerId);
    if (this.bgmMuted || previous.audio.paused || previous.audio.volume <= 0) {
      previous.audio.pause();
      previous.audio.currentTime = 0;
      this.bgm = null;
      this.commitPendingBaseMusic(transitionId);
      return;
    }

    const startedAt = Date.now();
    const startVolume = previous.audio.volume;
    previous.fadeTimerId = window.setInterval(() => {
      if (this.bgm !== previous || transitionId !== this.baseTransitionId) {
        window.clearInterval(previous.fadeTimerId!);
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / (AUDIO_FADE_OUT_DURATION * 1000));
      previous.audio.volume = startVolume * (1 - progress);
      if (progress >= 1) {
        window.clearInterval(previous.fadeTimerId!);
        previous.fadeTimerId = null;
        previous.audio.pause();
        previous.audio.currentTime = 0;
        this.bgm = null;
        this.commitPendingBaseMusic(transitionId);
      }
    }, 40);
  }

  private commitPendingBaseMusic(transitionId: number) {
    if (transitionId !== this.baseTransitionId || !this.pendingBaseMusic) return;
    const request = this.pendingBaseMusic;
    this.pendingBaseMusic = null;
    try {
      const audio = new Audio(request.url);
      audio.preload = "auto";
      audio.loop = true;
      audio.volume = 0;
      const music: MusicAudio = {
        audio,
        url: request.url,
        volume: request.volume,
        scope: request.scope,
        failedToLoad: false,
        fadeTimerId: null,
      };
      this.bgm = music;
      audio.addEventListener("error", () => {
        if (this.bgm?.audio !== audio) return;
        music.failedToLoad = true;
        this.needsAudioUnlock = false;
        console.warn("BGM 파일을 불러오지 못했습니다.", {
          scope: music.scope,
          mediaErrorCode: audio.error?.code ?? null,
        });
      }, { once: true });
      audio.addEventListener("canplay", () => {
        if (this.bgm?.audio === audio) this.reconcileBgmPlayback();
      }, { once: true });
      if (!this.current) {
        this.startMusicFadeIn(this.bgm);
      }
    } catch {
      this.stopBaseMusic();
    }
  }

  private enqueue(request: AudioRequest) {
    if (!hasBrowserAudio() || !request.url) return;
    if (this.current?.request.url === request.url) return;
    if (!this.current) {
      this.startTemporary(request);
      return;
    }
    this.queue.push(request);
  }

  private startTemporary(
    request: AudioRequest,
    options: {
      durationMs?: number;
      fadeOutMs?: number;
      pauseBase?: boolean;
    } = {},
  ) {
    this.stopPackRevealMusic();
    this.stopTemporary(false);
    if (options.pauseBase) {
      this.pauseBaseMusic();
    } else {
      this.fadeBaseOut();
    }
    try {
      const audio = new Audio(request.url);
      audio.preload = "auto";
      audio.volume = 0;
      const current = {
        audio,
        request,
        fadeTimerId: null as number | null,
        fadeOutTimerId: null as number | null,
        timeoutId: 0,
      };
      this.current = current;
      if (options.pauseBase) {
        this.commitPendingBaseMusic(this.baseTransitionId);
      }
      const durationMs = options.durationMs ?? AUDIO_STINGER_DURATION * 1000 + 100;
      const fadeOutMs = options.fadeOutMs ?? 0;
      const finish = () => this.fadeOutTemporary(audio, fadeOutMs, true);
      current.timeoutId = window.setTimeout(
        finish,
        Math.max(0, durationMs - fadeOutMs),
      );
      this.startFade(audio, safeVolume(request.volume), (timerId) => {
        if (this.current?.audio === audio) this.current.fadeTimerId = timerId;
      });
      audio.addEventListener("ended", () => {
        if (this.current?.audio === audio) finish();
      }, { once: true });
      audio.play().catch(() => {
        if (this.current?.audio === audio) this.finishTemporaryFor(audio, false);
      });
    } catch {
      this.finishTemporaryFor(undefined, false);
    }
  }

  private fadeOutTemporary(audio: HTMLAudioElement, durationMs: number, playNext: boolean) {
    const current = this.current;
    if (!current || current.audio !== audio) return;
    if (durationMs <= 0) {
      this.finishTemporaryFor(audio, playNext);
      return;
    }
    if (current.fadeOutTimerId !== null) window.clearInterval(current.fadeOutTimerId);
    const startVolume = audio.volume;
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (this.current?.audio !== audio) {
        window.clearInterval(timerId);
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      audio.volume = startVolume * (1 - progress);
      if (progress >= 1) {
        window.clearInterval(timerId);
        if (this.current?.audio === audio) {
          this.current.fadeOutTimerId = null;
          this.finishTemporaryFor(audio, playNext);
        }
      }
    }, 40);
    current.fadeOutTimerId = timerId;
  }

  private finishTemporaryFor(audio: HTMLAudioElement | undefined, playNext: boolean) {
    const current = this.current;
    if (!current) return;
    if (audio && current.audio !== audio) return;
    this.current = null;
    if (current.fadeTimerId !== null) window.clearInterval(current.fadeTimerId);
    if (current.fadeOutTimerId !== null) window.clearInterval(current.fadeOutTimerId);
    window.clearTimeout(current.timeoutId);
    current.audio.pause();
    current.audio.currentTime = 0;

    if (playNext) {
      const next = this.queue.shift();
      if (next) {
        this.startTemporary(next);
        return;
      }
    }
    this.resumeBaseMusic();
  }

  private stopTemporary(resumeBase: boolean) {
    const current = this.current;
    if (!current) {
      if (resumeBase) this.resumeBaseMusic();
      return;
    }
    this.current = null;
    if (current.fadeTimerId !== null) window.clearInterval(current.fadeTimerId);
    if (current.fadeOutTimerId !== null) window.clearInterval(current.fadeOutTimerId);
    window.clearTimeout(current.timeoutId);
    current.audio.pause();
    current.audio.currentTime = 0;
    if (resumeBase) this.resumeBaseMusic();
  }

  private stopBaseMusic() {
    this.baseTransitionId += 1;
    this.pendingBaseMusic = null;
    this.needsAudioUnlock = false;
    if (!this.bgm) return;
    if (this.bgm.fadeTimerId !== null) window.clearInterval(this.bgm.fadeTimerId);
    this.bgm.audio.pause();
    this.bgm.audio.currentTime = 0;
    this.bgm = null;
  }

  private fadeBaseOut() {
    if (!this.bgm || this.bgmMuted) {
      this.bgm?.audio.pause();
      return;
    }
    if (this.bgm.fadeTimerId !== null) window.clearInterval(this.bgm.fadeTimerId);
    const audio = this.bgm.audio;
    const start = audio.volume;
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (!this.bgm || this.bgm.audio !== audio) {
        window.clearInterval(timerId);
        return;
      }
      const progress = Math.min(1, (Date.now() - startedAt) / (AUDIO_FADE_OUT_DURATION * 1000));
      audio.volume = start * (1 - progress);
      if (progress >= 1) {
        if (this.bgm?.audio === audio) {
          window.clearInterval(timerId);
          this.bgm.fadeTimerId = null;
          audio.pause();
        }
      }
    }, 40);
    this.bgm.fadeTimerId = timerId;
  }

  private pauseBaseMusic() {
    if (!this.bgm) return;
    if (this.bgm.fadeTimerId !== null) window.clearInterval(this.bgm.fadeTimerId);
    this.bgm.fadeTimerId = null;
    this.bgm.audio.pause();
    if (this.pendingBaseMusic) {
      this.bgm.audio.currentTime = 0;
      this.bgm = null;
    }
  }

  private resumeBaseMusic() {
    this.reconcileBgmPlayback();
  }

  private reconcileBgmPlayback() {
    if (
      !this.bgm ||
      this.bgmMuted ||
      this.musicContext !== this.bgm.scope ||
      this.bgm.failedToLoad ||
      Boolean(this.bgm.audio.error) ||
      this.current
    ) return;
    if (!this.bgm.audio.paused && !this.needsAudioUnlock) return;
    this.startMusicFadeIn(this.bgm);
  }

  private startMusicFadeIn(music: MusicAudio) {
    if (
      !this.bgm ||
      this.bgm.audio !== music.audio ||
      this.musicContext !== music.scope ||
      this.current
    ) return;
    if (music.fadeTimerId !== null) window.clearInterval(music.fadeTimerId);
    music.audio.volume = 0;
    music.audio.play().then(() => {
      if (this.bgm?.audio !== music.audio) return;
      this.needsAudioUnlock = false;
      this.startFade(music.audio, safeVolume(music.volume * this.bgmVolume / 100), (timerId) => {
        if (this.bgm?.audio === music.audio) music.fadeTimerId = timerId;
      });
    }).catch((error: unknown) => {
      if (this.bgm?.audio !== music.audio) return;
      const errorName =
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : "UnknownError";
      if (music.failedToLoad || music.audio.error) {
        if (!music.failedToLoad) {
          music.failedToLoad = true;
          console.warn("BGM 파일을 불러오지 못했습니다.", {
            scope: music.scope,
            mediaErrorCode: music.audio.error?.code ?? null,
          });
        }
        this.needsAudioUnlock = false;
      } else if (errorName === "NotAllowedError") {
        this.needsAudioUnlock = true;
      } else {
        this.needsAudioUnlock = false;
        console.warn("BGM 재생을 시작하지 못했습니다.", {
          scope: music.scope,
          errorName,
        });
      }
    });
  }

  private startFade(
    audio: HTMLAudioElement,
    targetVolume: number,
    onTimer: (timerId: number) => void,
  ) {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / (AUDIO_FADE_IN_DURATION * 1000));
      audio.volume = targetVolume * progress;
      if (progress >= 1) {
        window.clearInterval(timerId);
      }
    }, 40);
    onTimer(timerId);
  }

  private startPackRevealMusic(
    url: string,
    volume: number,
    options: { maxDuration: number; fadeInMs: number; fadeOutMs: number },
    transitionId: number,
  ) {
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0;
      const reveal = { audio, timeoutId: 0, fadeTimerId: null as number | null };
      this.packReveal = reveal;
      this.fadeBaseOut();
      reveal.timeoutId = window.setTimeout(
        () => this.fadeOutPackReveal(reveal, options.fadeOutMs, () => {
          if (transitionId === this.packRevealTransitionId) this.resumeBaseMusic();
        }),
        Math.max(0, options.maxDuration - options.fadeOutMs),
      );
      audio.addEventListener("ended", () => {
        if (this.packReveal === reveal) {
          this.fadeOutPackReveal(reveal, options.fadeOutMs, () => this.resumeBaseMusic());
        }
      }, { once: true });
      audio.play().catch(() => {
        if (this.packReveal === reveal) this.stopPackRevealMusic();
      });
      const startedAt = Date.now();
      reveal.fadeTimerId = window.setInterval(() => {
        if (this.packReveal !== reveal) {
          if (reveal.fadeTimerId !== null) window.clearInterval(reveal.fadeTimerId);
          return;
        }
        const progress = Math.min(1, (Date.now() - startedAt) / Math.max(1, options.fadeInMs));
        audio.volume = safeVolume(volume) * progress;
        if (progress >= 1 && reveal.fadeTimerId !== null) {
          window.clearInterval(reveal.fadeTimerId);
          reveal.fadeTimerId = null;
        }
      }, 40);
    } catch {
      if (transitionId === this.packRevealTransitionId) this.packReveal = null;
    }
  }

  private fadeOutPackReveal(
    reveal: { audio: HTMLAudioElement; timeoutId: number; fadeTimerId: number | null },
    duration: number,
    onComplete: () => void,
  ) {
    if (this.packReveal !== reveal) {
      onComplete();
      return;
    }
    if (reveal.fadeTimerId !== null) window.clearInterval(reveal.fadeTimerId);
    window.clearTimeout(reveal.timeoutId);
    const startVolume = reveal.audio.volume;
    const startedAt = Date.now();
    reveal.fadeTimerId = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / Math.max(1, duration));
      reveal.audio.volume = startVolume * (1 - progress);
      if (progress >= 1) {
        if (reveal.fadeTimerId !== null) window.clearInterval(reveal.fadeTimerId);
        reveal.fadeTimerId = null;
        reveal.audio.pause();
        reveal.audio.currentTime = 0;
        if (this.packReveal === reveal) this.packReveal = null;
        onComplete();
      }
    }, 40);
  }
}

export const audioManager = new AudioManager();
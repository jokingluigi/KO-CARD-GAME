export const AUDIO_STINGER_DURATION = 10;
export const AUDIO_FADE_IN_DURATION = 0.5;
export const AUDIO_FADE_OUT_DURATION = 0.8;
export const PACK_REVEAL_MAX_DURATION = 7000;
export const PACK_REVEAL_FADE_IN = 600;
export const PACK_REVEAL_FADE_OUT = 800;

type TemporaryAudioKind = "CARD_ENTRANCE" | "PREVIEW";
type AudioRequest = {
  url: string;
  volume: number;
  kind: TemporaryAudioKind;
};

type MusicAudio = {
  audio: HTMLAudioElement;
  url: string;
  volume: number;
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
    timeoutId: number;
  } | null = null;
  private queue: AudioRequest[] = [];
  /**
   * `bgm` is the current persistent base music. It is intentionally kept as
   * this name because the mute and media preview APIs are BGM-compatible even
   * when the base is a completed Champion's music.
   */
  private bgm: MusicAudio | null = null;
  private pendingBaseMusic: { url: string; volume: number } | null = null;
  private baseTransitionId = 0;
  private bgmMuted = false;
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
    this.setBaseMusic(url, volume);
  }

  preview(url: string, volume: number) {
    this.stop();
    this.startTemporary({ url, volume, kind: "PREVIEW" });
  }

  playBgm(url: string, volume: number) {
    this.setBaseMusic(url, volume);
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
    if (!this.bgm) return;
    this.bgm.volume = volume;
    this.bgm.audio.volume = this.bgmMuted ? 0 : safeVolume(volume);
  }

  setBgmMuted(muted: boolean) {
    this.bgmMuted = muted;
    if (this.bgm) {
      this.bgm.audio.volume = muted ? 0 : safeVolume(this.bgm.volume);
    }
  }

  isBgmMuted() {
    return this.bgmMuted;
  }

  /** Stops both the persistent base and any temporary entrance music. */
  stopBgm() {
    this.stopPackRevealMusic();
    this.stopTemporary(false);
    this.queue = [];
    this.stopBaseMusic();
  }

  stop() {
    this.stopTemporary(false);
    this.queue = [];
  }

  private setBaseMusic(url: string, volume: number) {
    if (!hasBrowserAudio() || !url) return;
    if (this.bgm?.url === url) {
      this.bgm.volume = volume;
      if (!this.bgmMuted && !this.current) {
        this.bgm.audio.volume = safeVolume(volume);
      }
      return;
    }

    const previous = this.bgm;
    this.pendingBaseMusic = { url, volume };
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
      this.bgm = { audio, url: request.url, volume: request.volume, fadeTimerId: null };
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

  private startTemporary(request: AudioRequest) {
    this.stopPackRevealMusic();
    this.stopTemporary(false);
    this.fadeBaseOut();
    try {
      const audio = new Audio(request.url);
      audio.preload = "auto";
      audio.volume = 0;
      const timeoutId = window.setTimeout(
        () => this.finishTemporary(true),
        AUDIO_STINGER_DURATION * 1000 + 100,
      );
      this.current = { audio, request, fadeTimerId: null, timeoutId };
      this.startFade(audio, safeVolume(request.volume), (timerId) => {
        if (this.current?.audio === audio) this.current.fadeTimerId = timerId;
      });
      audio.addEventListener("ended", () => this.finishTemporary(true), { once: true });
      audio.play().catch(() => this.finishTemporary(false));
    } catch {
      this.finishTemporary(false);
    }
  }

  private finishTemporary(playNext: boolean) {
    const current = this.current;
    if (!current) return;
    this.current = null;
    if (current.fadeTimerId !== null) window.clearInterval(current.fadeTimerId);
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
    window.clearTimeout(current.timeoutId);
    current.audio.pause();
    current.audio.currentTime = 0;
    if (resumeBase) this.resumeBaseMusic();
  }

  private stopBaseMusic() {
    this.baseTransitionId += 1;
    this.pendingBaseMusic = null;
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
    this.bgm.fadeTimerId = window.setInterval(() => {
      if (!this.bgm || this.bgm.audio !== audio) return;
      const progress = Math.min(1, (Date.now() - startedAt) / (AUDIO_FADE_OUT_DURATION * 1000));
      audio.volume = start * (1 - progress);
      if (progress >= 1) {
        if (this.bgm?.audio === audio) {
          window.clearInterval(this.bgm.fadeTimerId!);
          this.bgm.fadeTimerId = null;
          audio.pause();
        }
      }
    }, 40);
  }

  private resumeBaseMusic() {
    if (!this.bgm || this.bgmMuted) return;
    this.startMusicFadeIn(this.bgm);
  }

  private startMusicFadeIn(music: MusicAudio) {
    if (!this.bgm || this.bgm.audio !== music.audio) return;
    if (music.fadeTimerId !== null) window.clearInterval(music.fadeTimerId);
    music.audio.volume = 0;
    music.audio.play().catch(() => {
      if (this.bgm?.audio === music.audio) this.stopBaseMusic();
    });
    this.startFade(music.audio, safeVolume(music.volume), (timerId) => {
      if (this.bgm?.audio === music.audio) music.fadeTimerId = timerId;
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
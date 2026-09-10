export const AUDIO_STINGER_DURATION = 10;
export const AUDIO_FADE_IN_DURATION = 0.4;
export const AUDIO_FADE_OUT_DURATION = 0.8;

type AudioPriority = "CARD_ENTRANCE" | "QUEST_COMPLETE";

type AudioRequest = {
  url: string;
  volume: number;
  priority: number;
  kind: AudioPriority;
};

function safeVolume(volume: number) {
  return Math.min(1, Math.max(0, volume / 100));
}

class AudioManager {
  private current: {
    audio: HTMLAudioElement;
    request: AudioRequest;
    intervalId: number;
    timeoutId: number;
  } | null = null;
  private queue: AudioRequest[] = [];
  private bgm: { audio: HTMLAudioElement; url: string; volume: number } | null = null;
  private bgmMuted = false;
  private attackAudio: HTMLAudioElement | null = null;

  playCardEntrance(url: string, volume: number) {
    this.enqueue({ url, volume, priority: 0, kind: "CARD_ENTRANCE" });
  }

  playQuestComplete(url: string, volume: number) {
    this.enqueue({ url, volume, priority: 10, kind: "QUEST_COMPLETE" });
  }

  preview(url: string, volume: number) {
    this.stop();
    this.start({ url, volume, priority: 100, kind: "CARD_ENTRANCE" });
  }

  playBgm(url: string, volume: number) {
    if (typeof window === "undefined" || !url) return;
    if (this.bgm?.url === url) {
      this.bgm.volume = volume;
      this.bgm.audio.volume = this.bgmMuted ? 0 : safeVolume(volume);
      return;
    }
    this.stopBgm();
    try {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.loop = true;
      audio.volume = this.bgmMuted ? 0 : safeVolume(volume);
      this.bgm = { audio, url, volume };
      audio.play().catch(() => {
        if (this.bgm?.audio === audio) this.stopBgm();
      });
    } catch {
      this.stopBgm();
    }
  }

  previewBgm(url: string, volume: number) {
    this.playBgm(url, volume);
  }

  playAttack(url: string, volume: number, pitch = 1) {
    if (typeof window === "undefined" || !url) return;
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
    if (this.bgm) {
      this.bgm.volume = volume;
      this.bgm.audio.volume = this.bgmMuted ? 0 : safeVolume(volume);
    }
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

  stopBgm() {
    if (!this.bgm) return;
    this.bgm.audio.pause();
    this.bgm.audio.currentTime = 0;
    this.bgm = null;
  }

  stop() {
    this.finishCurrent(false);
    this.queue = [];
  }

  private enqueue(request: AudioRequest) {
    if (typeof window === "undefined" || !request.url) return;
    if (this.current?.request.kind === request.kind && this.current.request.url === request.url) {
      return;
    }
    if (this.current && request.priority > this.current.request.priority) {
      this.finishCurrent(false);
      this.start(request);
      return;
    }
    if (!this.current) {
      this.start(request);
      return;
    }
    this.queue.push(request);
    this.queue.sort((left, right) => right.priority - left.priority);
  }

  private start(request: AudioRequest) {
    try {
      const audio = new Audio(request.url);
      audio.preload = "auto";
      audio.volume = 0;
      const intervalId = window.setInterval(() => this.update(audio, request), 40);
      const timeoutId = window.setTimeout(() => this.finishCurrent(true), AUDIO_STINGER_DURATION * 1000 + 100);
      this.current = { audio, request, intervalId, timeoutId };
      audio.addEventListener("ended", () => this.finishCurrent(true), { once: true });
      audio.play().catch(() => this.finishCurrent(false));
    } catch {
      this.finishCurrent(false);
    }
  }

  private update(audio: HTMLAudioElement, request: AudioRequest) {
    if (!this.current || this.current.audio !== audio) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.min(AUDIO_STINGER_DURATION, audio.duration)
      : AUDIO_STINGER_DURATION;
    const currentTime = Math.min(duration, audio.currentTime);
    const fadeIn = Math.min(1, currentTime / Math.min(AUDIO_FADE_IN_DURATION, duration));
    const fadeOutStart = Math.max(0, duration - AUDIO_FADE_OUT_DURATION);
    const fadeOut = currentTime <= fadeOutStart
      ? 1
      : Math.max(0, (duration - currentTime) / Math.min(AUDIO_FADE_OUT_DURATION, duration));
    audio.volume = safeVolume(request.volume) * Math.min(fadeIn, fadeOut);
    if (currentTime >= duration) this.finishCurrent(true);
  }

  private finishCurrent(playNext: boolean) {
    const current = this.current;
    if (!current) return;
    this.current = null;
    window.clearInterval(current.intervalId);
    window.clearTimeout(current.timeoutId);
    current.audio.pause();
    current.audio.currentTime = 0;
    if (playNext) {
      const next = this.queue.shift();
      if (next) this.start(next);
    }
  }
}

export const audioManager = new AudioManager();
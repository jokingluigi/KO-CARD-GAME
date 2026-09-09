export const AUDIO_STINGER_DURATION = 5;
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
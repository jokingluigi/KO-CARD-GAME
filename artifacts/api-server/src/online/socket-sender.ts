import { CatalogEncoder } from "@workspace/game-engine/online-catalog";
import type { OnlineServerMessage } from "./protocol";
import { recordPerformance } from "./performance";
type Ack = { requestId: string; version: number };
type Accepted = Extract<OnlineServerMessage, { type: "ACTION_ACCEPTED" }> & {
  acknowledgedRequests?: Ack[];
};
export function mergeAccepted(left: Accepted, right: Accepted): Accepted {
  const latest = left.version > right.version ? left : right;
  const acks = new Map(
    [
      ...(left.acknowledgedRequests ?? []),
      { requestId: left.requestId, version: left.version },
      ...(right.acknowledgedRequests ?? []),
      { requestId: right.requestId, version: right.version },
    ].map((ack) => [ack.requestId, ack]),
  );
  const events = new Map(
    [...left.events, ...right.events].map((event: any) => [
      event.sequenceNumber,
      event,
    ]),
  );
  return {
    ...latest,
    acknowledgedRequests: [...acks.values()],
    events: [...events.values()].sort(
      (a: any, b: any) => a.sequenceNumber - b.sequenceNumber,
    ),
  };
}
type Socket = {
  readyState: number;
  bufferedAmount: number;
  send(data: string): unknown;
  close(code: number, reason: string): unknown;
};
/** Encode only on actual send, so coalescing cannot break catalog revisions. */
export class BattleSocketSender {
  private pending: OnlineServerMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private encoder = new CatalogEncoder();
  private blockedAt = 0;
  private disposed = false;
  constructor(
    private socket: Socket,
    private compact: () => boolean,
  ) {}
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.pending = [];
  }
  send(message: OnlineServerMessage) {
    if (this.disposed || this.socket.readyState !== 1) return;
    if (
      this.compact() &&
      (message.type === "MATCH_SNAPSHOT" || message.type === "RESYNC_REQUIRED")
    )
      this.pending = this.pending.filter(
        (m) => !("matchId" in m) || m.matchId !== message.matchId,
      );
    const last = this.pending.at(-1);
    if (
      this.compact() &&
      message.type === "ACTION_ACCEPTED" &&
      last?.type === "ACTION_ACCEPTED" &&
      last.matchId === message.matchId
    )
      this.pending[this.pending.length - 1] = mergeAccepted(last, message);
    else this.pending.push(message);
    this.flush();
  }
  private flush = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed || this.socket.readyState !== 1) {
      this.dispose();
      return;
    }
    recordPerformance("socketBufferedBytes", this.socket.bufferedAmount);
    if (
      this.socket.bufferedAmount > 8 * 1024 * 1024 ||
      this.pending.length > 256 ||
      (this.blockedAt && Date.now() - this.blockedAt > 8000)
    ) {
      this.dispose();
      this.socket.close(
        1013,
        "Connection too slow; reconnect for current state",
      );
      return;
    }
    while (this.pending.length && this.socket.bufferedAmount < 128 * 1024) {
      const next = this.pending.shift()!,
        start = performance.now();
      const data = JSON.stringify(
        this.compact() ? this.encoder.encode(next) : next,
      );
      recordPerformance("serializationMs", performance.now() - start);
      recordPerformance("messageBytes", Buffer.byteLength(data));
      this.socket.send(data);
    }
    if (this.pending.length) {
      this.blockedAt ||= Date.now();
      this.timer = setTimeout(this.flush, 16);
      this.timer.unref?.();
    } else this.blockedAt = 0;
  };
}

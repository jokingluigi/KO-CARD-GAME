import { useSyncExternalStore } from "react";

/**
 * 턴 남은 시간처럼 1초마다 바뀌는 값을 담는 작은 저장소.
 * 값이 바뀌어도 이 값을 쓰는 작은 부품(시계)만 다시 그려진다 — 대전 화면 전체가 매초 다시 그려지는 잔렉 방지.
 */
export type SecondsStore = { get(): number; set(value: number): void; subscribe(listener: () => void): () => void };

export function createSecondsStore(initial: number): SecondsStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) { if (next === value) return; value = next; listeners.forEach((listener) => listener()); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const noop = () => () => undefined;
/** 숫자를 그대로 받거나, 저장소를 받아 최신 값을 돌려준다. */
export function useSecondsValue(source: number | SecondsStore): number {
  const store = typeof source === "number" ? null : source;
  const live = useSyncExternalStore(store ? store.subscribe : noop, store ? store.get : () => source as number);
  return store ? live : (source as number);
}
export function readSeconds(source: number | SecondsStore): number {
  return typeof source === "number" ? source : source.get();
}

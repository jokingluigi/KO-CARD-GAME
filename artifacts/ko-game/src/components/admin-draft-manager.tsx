import { MatchRecapPanel } from "./match-recap-panel";
import { KEYWORD_LABELS } from "./alt-inspector-utils";
import { useEffect, useRef, useState } from "react";
import { DraftConfigFields } from "./draft-config-fields";
import { useLocation } from "wouter";
import {
  draftRequest,
  draftCommand,
  type DraftSettings,
  type DraftView,
} from "@/lib/draft-client";
import { type DraftConfig, type CardDefinition } from "@workspace/game-engine";
import { CARD_RARITY_LABELS } from "@/game/cards/types";
const button =
  "min-h-11 rounded border border-primary/60 bg-primary/10 px-4 py-2 text-sm font-bold disabled:opacity-40";
export function AdminDraftManager() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<DraftSettings | null>(null),
    [view, setView] = useState<DraftView | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [room, setRoom] = useState(""),
    [showConfig, setShowConfig] = useState(false),
    [serverOffset, setServerOffset] = useState(0),
    [clock, setClock] = useState(Date.now());
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error]);
  async function load() {
    const data = await draftRequest<DraftSettings>("");
    setSettings(data);
    const id =
      data.currentId ??
      new URLSearchParams(window.location.search).get("session");
    if (id && data.enabled)
      setView(
        await draftRequest<DraftView>(`/sessions/${encodeURIComponent(id)}`),
      );
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (
      !view ||
      !settings?.enabled ||
      ["ABORTED", "FINISHED"].includes(view.phase)
    )
      return;
    let cancelled = false;
    const timer = setInterval(() => {
      setClock(Date.now());
      void draftRequest<DraftView>(`/sessions/${view.id}`)
        .then((v) => {
          if (!cancelled) setView(v);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [view?.id, view?.phase, settings?.enabled]);
  useEffect(() => {
    if (view) setServerOffset(view.serverTime - Date.now());
  }, [view?.serverTime]);
  useEffect(() => {
    if (view?.phase === "BATTLE") navigate(`/admin/draft/match/${view.id}`);
  }, [view?.phase, view?.id]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function save(enabled: boolean, config = settings!.config) {
    const result = await draftRequest<{
      enabled: boolean;
      config: DraftConfig;
    }>("/settings", "PUT", { enabled, config });
    setSettings((s) => (s ? { ...s, ...result } : s));
    await load();
  }
  async function command(type: string, id?: string) {
    if (!view) return;
    const result = await draftCommand(view, type, id);
    setView(result);
    if (result.phase === "ABORTED") {
      setView(null);
      await load();
    }
  }
  const own = view?.own,
    cardMap = new Map((view?.cards ?? []).map((c) => [c.id, c]));
  const deck = (ids: string[]) =>
    Array.from(new Set(ids)).map((id) => {
      const c = cardMap.get(id);
      return (
        <li key={id} className="flex gap-2 py-1 text-sm">
          <span className="text-primary">{c?.cost ?? "?"} 코스트</span>
          <span className="min-w-0 flex-1 break-words">{c?.name ?? id}</span>
          <span>×{ids.filter((v) => v === id).length}</span>
        </li>
      );
    });
  function cardContent(c: CardDefinition) {
    return (
      <>
        <p className="text-xs text-primary">
          {CARD_RARITY_LABELS[c.rarity ?? "NORMAL"]} ·{" "}
          {c.cardType === "TECHNIQUE" ? "기술" : "선수"} · {c.cost} 코스트
        </p>
        {c.imageUrl && (
          <img
            src={c.imageUrl}
            alt=""
            className="mx-auto my-2 h-40 max-w-full object-contain"
          />
        )}
        <h3 className="break-words text-lg font-black">{c.name}</h3>
        <p className="mt-2 text-sm">
          공격 {c.attack} / 체력 {c.health}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-300">
          {c.rulesText}
        </p>
        <p className="mt-2 text-xs text-primary">
          {c.keywords.map((k) => KEYWORD_LABELS[k] ?? k).join(" · ")}
        </p>
        <p className="mt-2 text-xs text-neutral-400">{c.tags?.join(" · ")}</p>
      </>
    );
  }
  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">드래프트 모드</h2>
          <p className="mt-1 text-sm text-neutral-400">
            관리자 전용 · 챔피언 선택 후 25장 편성 · 한 번의 대전
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings?.enabled ?? false}
          disabled={busy || !settings}
          onClick={() => void run(() => save(!settings!.enabled))}
          className={button}
        >
          {settings?.enabled ? "ON" : "OFF"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorRef}
          className="break-words rounded border border-red-500/50 p-3 text-red-300"
        >
          {error}
        </p>
      )}
      {settings?.poolWarning && (
        <p className="break-words rounded border border-amber-600/40 p-3 text-sm text-amber-200">
          {settings.poolWarning}
        </p>
      )}
      {settings?.poolError && (
        <p className="break-words text-amber-300">{settings.poolError}</p>
      )}
      {!settings && <p>드래프트 설정을 불러오는 중…</p>}
      {settings?.enabled && !view && (
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || Boolean(settings.poolError)}
            className={button}
            onClick={() =>
              void run(async () =>
                setView(
                  await draftRequest<DraftView>("/sessions", "POST", {
                    mode: "AI",
                  }),
                ),
              )
            }
          >
            AI 드래프트 시작
          </button>
          <button
            disabled={busy || Boolean(settings.poolError)}
            className={button}
            onClick={() =>
              void run(async () =>
                setView(
                  await draftRequest<DraftView>("/sessions", "POST", {
                    mode: "PVP",
                  }),
                ),
              )
            }
          >
            PvP 방 만들기
          </button>
          <input
            aria-label="드래프트 방 ID"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="다른 관리자의 방 ID"
            className="min-h-11 min-w-0 rounded border bg-black px-3 text-base"
          />
          <button
            disabled={busy || !room.trim()}
            className={button}
            onClick={() =>
              void run(async () => {
                const invitation = await draftRequest<{
                  id: string;
                  version: number;
                }>(`/sessions/${encodeURIComponent(room.trim())}/invitation`);
                setView(
                  await draftRequest<DraftView>(
                    `/sessions/${invitation.id}/commands`,
                    "POST",
                    {
                      type: "JOIN",
                      version: invitation.version,
                      requestId: crypto.randomUUID(),
                    },
                  ),
                );
              })
            }
          >
            방 참가
          </button>
        </div>
      )}
      {!settings?.enabled && settings && (
        <p className="text-neutral-400">
          OFF 상태입니다. ON으로 설정하면 관리자만 드래프트에 입장할 수
          있습니다.
        </p>
      )}
      {settings && (
        <>
          <button className={button} onClick={() => setShowConfig((v) => !v)}>
            카드 풀 / 선택 규칙 설정
          </button>
          {showConfig && (
            <div className="space-y-3 rounded border border-neutral-700 p-3">
              <p className="text-sm text-neutral-400">
                공개 카드와 챔피언만 후보로 나옵니다. 선택 해제하면 다음
                드래프트부터 제외됩니다.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="max-h-60 overflow-y-auto">
                  <h3 className="font-bold">카드 풀</h3>
                  {settings.cards.map((c) => (
                    <label key={c.id} className="flex gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          !settings.config.excludedCardIds.includes(c.id)
                        }
                        onChange={(e) => {
                          const config = {
                            ...settings.config,
                            excludedCardIds: e.target.checked
                              ? settings.config.excludedCardIds.filter(
                                  (id) => id !== c.id,
                                )
                              : [...settings.config.excludedCardIds, c.id],
                          };
                          setSettings({ ...settings, config });
                        }}
                      />
                      <span className="break-words">
                        {c.name} ({CARD_RARITY_LABELS[c.rarity ?? "NORMAL"]})
                      </span>
                    </label>
                  ))}
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <h3 className="font-bold">챔피언 풀</h3>
                  {settings.champions.map((c) => (
                    <label key={c.id} className="flex gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          !settings.config.excludedChampionIds.includes(c.id)
                        }
                        onChange={(e) => {
                          const config = {
                            ...settings.config,
                            excludedChampionIds: e.target.checked
                              ? settings.config.excludedChampionIds.filter(
                                  (id) => id !== c.id,
                                )
                              : [...settings.config.excludedChampionIds, c.id],
                          };
                          setSettings({ ...settings, config });
                        }}
                      />
                      <span className="break-words">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DraftConfigFields
                config={settings.config}
                cards={settings.cards}
                champions={settings.champions}
                onChange={(config) => setSettings({ ...settings, config })}
              />
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  void run(() => save(settings.enabled, settings.config))
                }
              >
                설정 저장
              </button>
            </div>
          )}
        </>
      )}
      {view && settings?.enabled && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="break-all text-sm">
              {view.mode} · 방 ID: {view.id}
            </p>
            <button
              disabled={busy}
              className={button}
              onClick={() => void run(() => command("ABORT"))}
            >
              드래프트 종료
            </button>
          </div>
          {view.phase === "WAITING" ? (
            <p>
              다른 관리자에게 방 ID를 전달해 주세요. 참가하면 동시에 선택을
              시작합니다.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <span className="font-bold">
                  {own?.championId
                    ? `${own.deck.length}/25장 선택`
                    : "챔피언을 선택해 주세요"}
                </span>
                <span className="text-neutral-400">
                  상대: {view.opponent.picks}/25{" "}
                  {view.opponent.ready ? "준비 완료" : ""}
                </span>
                {own?.deadline && (
                  <span className="text-amber-300">
                    {Math.max(
                      0,
                      Math.ceil((own.deadline - clock - serverOffset) / 1000),
                    )}
                    초
                  </span>
                )}
              </div>
              {own && own.deck.length < 25 && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {own.offers.map((id) => {
                    const c = cardMap.get(id),
                      champ = view.champions.find((c) => c.id === id);
                    return (
                      <button
                        disabled={busy}
                        className="min-w-0 rounded border border-primary/50 bg-neutral-900 p-3 text-left hover:border-primary disabled:opacity-40"
                        key={id}
                        onClick={() => void run(() => command("PICK", id))}
                      >
                        {c ? (
                          cardContent(c)
                        ) : (
                          <>
                            {champ?.imageUrl && (
                              <img
                                src={champ.imageUrl}
                                alt=""
                                className="mx-auto h-40 max-w-full object-contain"
                              />
                            )}
                            <h3 className="text-lg font-black">
                              {champ?.name}
                            </h3>
                            <p className="text-sm">체력 {champ?.maxHealth}</p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                              {champ?.ability.description}
                            </p>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {own && own.deck.length === 25 && view.phase === "DRAFT" && (
                <div className="space-y-3">
                  <p>
                    편성을 확인하고 준비해 주세요. PvP는 양쪽 모두 준비하면
                    시작합니다.
                  </p>
                  <button
                    disabled={busy || own.ready}
                    className={button}
                    onClick={() => void run(() => command("READY"))}
                  >
                    {own.ready ? "상대 준비 대기 중" : "이 덱으로 대전 시작"}
                  </button>
                </div>
              )}
              {own && (
                <div className="rounded border border-neutral-700 p-3">
                  <h3 className="font-black">
                    내 드래프트 덱 ·{" "}
                    {view.champions.find((c) => c.id === own.championId)?.name}
                  </h3>
                  <p className="my-2 text-sm text-neutral-400">
                    비용: 0~2{" "}
                    {
                      own.deck.filter((id) => (cardMap.get(id)?.cost ?? 0) <= 2)
                        .length
                    }
                    장 / 3~4{" "}
                    {
                      own.deck.filter((id) => {
                        const n = cardMap.get(id)?.cost ?? 0;
                        return n >= 3 && n <= 4;
                      }).length
                    }
                    장 / 5+{" "}
                    {
                      own.deck.filter((id) => (cardMap.get(id)?.cost ?? 0) >= 5)
                        .length
                    }
                    장
                  </p>
                  <p className="text-xs text-neutral-400">
                    태그:{" "}
                    {Array.from(
                      new Set(
                        own.deck.flatMap((id) => cardMap.get(id)?.tags ?? []),
                      ),
                    ).join(" · ") || "없음"}
                  </p>
                  <ul className="mt-2">{deck(own.deck)}</ul>
                </div>
              )}
              {view.phase === "FINISHED" && (
                <div>
                  {view.result && (
                    <div className="mb-4 space-y-2">
                      <h3 className="text-lg font-black">
                        {view.result.won ? "승리" : "패배"} ·{" "}
                        {view.result.turns}턴
                      </h3>
                      <p className="text-sm">승자: {view.result.winnerName}</p>
                      {view.recap && (
                        <MatchRecapPanel
                          recap={view.recap}
                          viewerId={
                            view.seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO"
                          }
                        />
                      )}
                    </div>
                  )}
                  <h3 className="font-black">
                    상대 드래프트 덱 ·{" "}
                    {
                      view.champions.find(
                        (c) => c.id === view.opponent.championId,
                      )?.name
                    }
                  </h3>
                  <ul>{deck(view.opponent.deck ?? [])}</ul>
                  <button
                    className={button}
                    onClick={() => {
                      setView(null);
                      navigate("/admin/draft");
                      void load();
                    }}
                  >
                    새 드래프트
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

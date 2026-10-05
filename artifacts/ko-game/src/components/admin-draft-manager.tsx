import { MatchRecapPanel } from "./match-recap-panel";
import { DraftReadyPanel } from "./draft-ready-panel";
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
import {
  DRAFT_MUTATIONS,
  type DraftConfig,
  type CardDefinition,
} from "@workspace/game-engine";
import { CARD_RARITY_LABELS } from "@/game/cards/types";
const button =
  "min-h-11 rounded border border-primary/60 bg-primary/10 px-4 py-2 text-sm font-bold disabled:opacity-40";
export function AdminDraftManager({
  administration = true,
}: {
  administration?: boolean;
}) {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<DraftSettings | null>(null),
    [view, setView] = useState<DraftView | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [showConfig, setShowConfig] = useState(false),
    [serverOffset, setServerOffset] = useState(0),
    [clock, setClock] = useState(Date.now());
  const errorRef = useRef<HTMLParagraphElement>(null);
  const commandRevision = useRef(0);
  const commandRunning = useRef(false);
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
    let pollRunning = false;
    const timer = setInterval(() => {
      setClock(Date.now());
      if (pollRunning || commandRunning.current) return;
      pollRunning = true;
      const revision = commandRevision.current;
      void draftRequest<DraftView>(`/sessions/${view.id}`)
        .then((v) => {
          if (!cancelled && revision === commandRevision.current)
            setView((previous) =>
              previous && previous.id === v.id && previous.version > v.version
                ? previous
                : v,
            );
        })
        .catch((e) => {
          if (!cancelled && revision === commandRevision.current)
            setError(e.message);
        })
        .finally(() => {
          pollRunning = false;
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
    if (view?.phase === "BATTLE") navigate(`/draft/match/${view.id}`);
  }, [view?.phase, view?.id]);
  async function run(fn: () => Promise<void>) {
    if (commandRunning.current) return;
    commandRunning.current = true;
    commandRevision.current++;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
      if (view) {
        try {
          setView(await draftRequest<DraftView>(`/sessions/${view.id}`));
        } catch {
          /* Preserve the original action error; the periodic read can retry. */
        }
      }
    } finally {
      commandRunning.current = false;
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
        {c.cardType !== "TECHNIQUE" && (
          <p className="mt-2 text-sm">
            공격 {c.attack} / 체력 {c.health}
          </p>
        )}
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
            챔피언 선택 후 25장 편성 · 한 번의 대전
          </p>
        </div>
        {administration && (
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
        )}
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
      {settings?.poolError && (
        <p className="break-words text-amber-300">{settings.poolError}</p>
      )}
      {!settings && <p>드래프트 설정을 불러오는 중…</p>}
      {settings?.enabled && !view && (
        <div className="ko-online-panel flex flex-wrap gap-3 rounded-xl p-6">
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
                setView(await draftRequest<DraftView>("/matchmaking", "POST")),
              )
            }
          >
            빠른 대전
          </button>
        </div>
      )}
      {!settings?.enabled && settings && (
        <p className="text-neutral-400">드래프트 모드는 현재 OFF 상태입니다.</p>
      )}
      {administration && settings && (
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
              {view.mode === "PVP" ? "플레이어 대전" : "AI 대전"}
            </p>
            <button
              disabled={busy}
              className={button}
              onClick={() => void run(() => command("ABORT"))}
            >
              {view.phase === "WAITING" ? "매칭 취소" : "드래프트 종료"}
            </button>
          </div>
          {view.phase === "WAITING" ? (
            <div className="ko-online-panel rounded-xl px-6 py-10 text-center" role="status"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-neutral-800 border-t-amber-400" /><h3 className="mt-5 text-xl font-black">상대를 찾고 있습니다</h3><p className="mt-3 text-sm leading-6 text-neutral-400">매칭되면 챔피언과 카드를 선택합니다.</p></div>
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
              {own?.championId &&
                own.deck.length < 25 &&
                !own.mutationEvent && (
                  <div className="flex flex-wrap items-center gap-3">
                    {own.specialPick && (
                      <span className="rounded border border-amber-400 px-3 py-2 font-bold">
                        특수 픽 ·{" "}
                        {
                          {
                            EPIC: "에픽",
                            HIGH_COST: "고코스트",
                            LOW_COST: "저코스트",
                            SYNERGY: "시너지",
                            CHAOS: "카오스",
                          }[own.specialPick]
                        }
                      </span>
                    )}
                    <button
                      disabled={
                        busy ||
                        (own.rerollsUsed ?? 0) >= view.config.rerollCount
                      }
                      className={button}
                      onClick={() => void run(() => command("REROLL"))}
                    >
                      리롤 · 남은{" "}
                      {Math.max(
                        0,
                        view.config.rerollCount - (own.rerollsUsed ?? 0),
                      )}
                      회
                    </button>
                    <span className="text-xs text-neutral-400">
                      잠근 후보 1장은 리롤해도 유지됩니다.
                    </span>
                  </div>
                )}
              {own?.mutationEvent && (
                <div className="space-y-3 rounded border border-primary p-3">
                  <h3 className="font-black">
                    {own.mutationEvent.grand ? "대변이" : "카드 개조"} ·{" "}
                    {own.mutationEvent.targetId
                      ? "개조를 선택하세요"
                      : "선수 카드 한 장을 선택하세요"}
                  </h3>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => void run(() => command("MUTATION_SKIP"))}
                  >
                    개조 건너뛰기
                  </button>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {!own.mutationEvent.targetId
                      ? own.cards
                          ?.filter(
                            (copy) =>
                              !copy.mutation &&
                              cardMap.get(copy.definitionId)?.cardType !==
                                "TECHNIQUE",
                          )
                          .map((copy) => (
                            <button
                              key={copy.instanceId}
                              disabled={busy}
                              className="min-h-11 min-w-0 rounded border border-neutral-600 p-3 text-left"
                              onClick={() =>
                                void run(() =>
                                  command("MUTATION_TARGET", copy.instanceId),
                                )
                              }
                            >
                              {cardContent(cardMap.get(copy.definitionId)!)}
                            </button>
                          ))
                      : own.mutationEvent.offers.map((id) => {
                          const m = DRAFT_MUTATIONS.find((m) => m.id === id)!;
                          return (
                            <button
                              key={id}
                              disabled={busy}
                              className="min-h-11 min-w-0 rounded border border-primary p-3 text-left"
                              onClick={() =>
                                void run(() => command("MUTATION_PICK", id))
                              }
                            >
                              <h4 className="font-bold">{m.name}</h4>
                              <p>
                                ATK {m.attack >= 0 ? "+" : ""}
                                {m.attack} · HP {m.health >= 0 ? "+" : ""}
                                {m.health} · 비용 {m.cost >= 0 ? "+" : ""}
                                {m.cost}
                              </p>
                              <p>
                                {m.keywords
                                  .map((k) => KEYWORD_LABELS[k])
                                  .join(" · ")}
                                {m.armor ? "(1)" : ""}
                              </p>
                            </button>
                          );
                        })}
                  </div>
                </div>
              )}
              {own && own.deck.length < 25 && !own.mutationEvent && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {own.offers.map((id) => {
                    const c = cardMap.get(id),
                      champ = view.champions.find((c) => c.id === id);
                    return (
                      <div key={id} className="min-w-0 space-y-2">
                        <button
                          disabled={busy}
                          className="min-h-11 w-full min-w-0 rounded border border-primary/50 bg-neutral-900 p-3 text-left hover:border-primary disabled:opacity-40"
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
                        {c && (
                          <button
                            className={`${button} w-full`}
                            aria-pressed={own.lockedOfferId === id}
                            disabled={busy}
                            onClick={() => void run(() => command("LOCK", id))}
                          >
                            {own.lockedOfferId === id
                              ? "잠금 해제"
                              : "이 후보 잠금"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {own && own.deck.length === 25 && view.phase === "DRAFT" && <DraftReadyPanel view={view} busy={busy} onReady={() => void run(() => command("READY"))} />}
              {own && (
                <div className="ko-online-panel rounded-xl p-5 sm:p-6">
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
                  <ul className="mt-4 grid max-h-[28rem] gap-x-6 overflow-y-auto sm:grid-cols-2">
                    {own.cards
                      ? own.cards.map((copy) => {
                          const c = cardMap.get(copy.definitionId)!;
                          const m = copy.mutation;
                          return (
                            <li
                              key={copy.instanceId}
                              className="border-t border-neutral-800 py-2 text-sm"
                            >
                              <span>
                                {c.name} ·{" "}
                                {Math.max(0, c.cost + (m?.cost ?? 0))} 코스트
                              </span>
                              {m && (
                                <p className="text-primary">
                                  🔧 Draft Mutation · {m.name} · ATK{" "}
                                  {c.attack + m.attack} / HP{" "}
                                  {c.health + m.health} ·{" "}
                                  {m.keywords
                                    .map((k) => KEYWORD_LABELS[k])
                                    .join(" · ")}
                                </p>
                              )}
                            </li>
                          );
                        })
                      : deck(own.deck)}
                  </ul>
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
                      navigate(administration ? "/admin/draft" : "/draft");
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

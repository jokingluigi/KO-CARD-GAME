import { useState } from "react";
import type { Season } from "../../../../lib/game-engine/src/tower/types";
import type {
  TowerFloor,
  TowerBoss,
} from "../../../../lib/game-engine/src/tower/types-v2";
import type { CardDefinition, ChampionDefinition } from "@/game";
import { TowerEffectEditor } from "./tower-effect-editor";
import { TowerMusicEditor } from "./tower-music-editor";
const input =
  "min-h-12 w-full min-w-0 border border-neutral-600 bg-black p-3 text-base";
export function AdminTowerV2({
  rows,
  cards,
  champions,
  scenes,
  starters,
  relics,
  packs,
  request,
  onRefresh,
}: {
  rows: { id: string; data: any }[];
  cards: CardDefinition[];
  champions: ChampionDefinition[];
  scenes: { id: string; data: any }[];
  starters: { id: string; data: any }[];
  relics: { id: string; data: any }[];
  packs: { id: string; name: string }[];
  request: (path: string, body?: unknown, method?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Season | null>(null),
    [tab, setTab] = useState("기본"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [versions, setVersions] = useState<any[]>([]),
    [search, setSearch] = useState("");
  const [testStarter, setTestStarter] = useState(""),
    [testChampion, setTestChampion] = useState(""),
    [testFloor, setTestFloor] = useState(1),
    [testHidden, setTestHidden] = useState(false),
    [testEnemy, setTestEnemy] = useState(""),
    [testBoss, setTestBoss] = useState(""),
    [testRelics, setTestRelics] = useState<string[]>([]),
    [testDeck, setTestDeck] = useState<string[]>([]);
  const patch = (p: Partial<Season>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));
  const update = (p: Partial<NonNullable<Season["v2"]>>) =>
    setDraft((d) => (d ? { ...d, v2: { ...d.v2!, ...p } } : d));
  const work = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };
  function create(copy?: Season) {
    const id = crypto.randomUUID();
    setDraft(
      copy
        ? { ...structuredClone(copy), id, name: copy.name + " 복사" }
        : {
            id,
            name: "새 타워",
            description: "",
            protagonistChampionId: "",
            bosses: {} as any,
            synergyWeights: { deckTag: 2, supportTag: 3, championTag: 2 },
            v2: {
              schemaVersion: 2,
              enabled: true,
              visible: true,
              sortOrder: 0,
              recommendedDifficulty: "보통",
              rarityWeights: { NORMAL: 70, EPIC: 25, LEGENDARY: 5 },
              floors: Array.from({ length: 16 }, (_, i) => ({
                id: crypto.randomUUID(),
                number: i + 1,
                type: (i + 1) % 4 === 0 ? "BOSS" : "NORMAL",
                enemies: [],
                relicReward: [4, 8, 12].includes(i + 1),
              })),
              bosses: [],
            },
          },
    );
    setVersions([]);
  }
  const field = (
    label: string,
    value: string | number,
    onChange: (v: any) => void,
    type = "text",
  ) => (
    <label className="block">
      {label}
      <input
        className={input}
        type={type}
        value={value}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </label>
  );
  const scene = (
    label: string,
    value: string | undefined,
    onChange: (v: string | undefined) => void,
  ) => (
    <label>
      {label}
      <select
        className={input}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">없음</option>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.data.name}
          </option>
        ))}
      </select>
    </label>
  );
  const eligible = cards.filter(
    (c) =>
      c.status !== "DISABLED" &&
      !c.isToken &&
      !c.isChampionToken &&
      !["CHAMPION", "TOKEN"].includes(c.rarity ?? "") &&
      !/^(test-|admin-test-|internal-)/.test(c.id),
  );
  const deck = (ids: string[], change: (ids: string[]) => void) => (
    <div className="space-y-2">
      <p>덱 {ids.length}/25장 · 중복 제한 없음</p>
      <input
        className={input}
        aria-label="보스 카드 검색"
        placeholder="카드 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        className={input}
        value=""
        onChange={(e) => {
          if (e.target.value && ids.length < 25)
            change([...ids, e.target.value]);
        }}
      >
        <option value="">카드 추가</option>
        {eligible
          .filter((c) => c.name.includes(search))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.cost} · {c.name}
            </option>
          ))}
      </select>
      <ol className="max-h-80 overflow-y-auto">
        {ids.map((id, i) => (
          <li
            key={i}
            className="flex min-w-0 items-center gap-2 border-b border-neutral-800"
          >
            <span className="min-w-0 flex-1 break-words">
              {i + 1}. {cards.find((c) => c.id === id)?.name ?? id}
            </span>
            <button
              type="button"
              className="min-h-12 px-3"
              onClick={() => change(ids.filter((_, n) => n !== i))}
            >
              제거
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
  const difficulty = (value: string, change: (v: any) => void) => (
    <label>
      AI 난이도
      <select
        className={input}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {[
          ["EASY", "쉬움"],
          ["NORMAL", "보통"],
          ["HARD", "어려움"],
        ].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  const image = (
    label: string,
    url: string | undefined,
    apply: (url: string | undefined) => void,
  ) => (
    <label className="block">
      {label}
      {url && <img src={url} alt="" className="max-h-40 max-w-full" />}
      <input
        className={input}
        disabled={busy}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void work(async () => {
              const pending = await request("/cards/images/upload-url", {
                name: file.name,
                size: file.size,
                contentType: file.type,
              });
              const result = await fetch(pending.uploadURL, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
              });
              if (!result.ok) throw new Error("이미지 업로드 실패");
              const complete = await request("/cards/images/complete", {
                objectPath: pending.objectPath,
                contentType: file.type,
              });
              apply(complete.imageUrl);
            });
        }}
      />
      {url && (
        <button className={input} onClick={() => apply(undefined)}>
          이미지 해제
        </button>
      )}
    </label>
  );
  const rewards = (items: any[], change: (items: any[]) => void) => (
    <div>
      {items.map((r, i) => (
        <div key={i} className="space-y-2 border-b border-neutral-700 py-3">
          <select
            className={input}
            value={r.type}
            onChange={(e) =>
              change(
                items.map((x, n) =>
                  n === i
                    ? { ...x, type: e.target.value, targetId: undefined }
                    : x,
                ),
              )
            }
          >
            {[
              ["CURRENCY", "크레딧"],
              ["PACK", "팩"],
              ["CARD", "카드"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {r.type !== "CURRENCY" && (
            <label>
              보상 대상
              <select
                className={input}
                value={r.targetId ?? ""}
                onChange={(e) =>
                  change(
                    items.map((x, n) =>
                      n === i ? { ...x, targetId: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">선택</option>
                {(r.type === "CARD" ? cards : packs).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {field(
            "수량",
            r.amount,
            (v) =>
              change(items.map((x, n) => (n === i ? { ...x, amount: v } : x))),
            "number",
          )}
          <button
            className={input}
            onClick={() => change(items.filter((_, n) => n !== i))}
          >
            보상 제거
          </button>
        </div>
      ))}
      <button
        className={input}
        onClick={() => change([...items, { type: "CURRENCY", amount: 100 }])}
      >
        보상 추가
      </button>
      {!items.length && <p>보상 없음</p>}
    </div>
  );
  return (
    <section
      className="min-w-0 space-y-4 border-y border-primary/50 py-5"
      data-testid="admin-tower-v2"
    >
      <h3 className="text-xl font-bold">타워 V2 제작 · 공개 버전</h3>
      <p className="text-sm text-neutral-400">
        기존 V1 런은 보존됩니다. 저장은 초안, 공개는 전투 콘텐츠 전체의 불변
        버전을 만듭니다.
      </p>
      <select
        className={input}
        aria-label="V2 타워 선택"
        value={draft?.id ?? ""}
        onChange={(e) => {
          const row = rows.find((r) => r.id === e.target.value);
          if (row) {
            setDraft(structuredClone(row.data));
            setVersions([]);
          }
        }}
      >
        <option value="">타워 선택</option>
        {rows
          .filter((r) => r.data.v2)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.data.name}
            </option>
          ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button className={input + " sm:w-auto"} onClick={() => create()}>
          새 V2 타워
        </button>
        {draft && (
          <button
            className={input + " sm:w-auto"}
            onClick={() => create(draft)}
          >
            복제
          </button>
        )}
      </div>
      {draft?.v2 && (
        <>
          <nav className="flex flex-wrap gap-2">
            {["기본", "층", "보스", "컷씬·히든", "확률", "공개·테스트"].map(
              (t) => (
                <button
                  key={t}
                  className={
                    "min-h-12 border px-3 " +
                    (tab === t
                      ? "border-primary text-primary"
                      : "border-neutral-700")
                  }
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ),
            )}
          </nav>
          {tab === "기본" && (
            <div className="space-y-3">
              {field("타워 이름", draft.name, (v) => patch({ name: v }))}
              {field("설명", draft.description, (v) =>
                patch({ description: v }),
              )}
              {field("권장 난이도", draft.v2.recommendedDifficulty, (v) =>
                update({ recommendedDifficulty: v }),
              )}
              {field(
                "정렬",
                draft.v2.sortOrder,
                (v) => update({ sortOrder: v }),
                "number",
              )}
              {["imageUrl", "selectionImageUrl", "backgroundUrl"].map((key) => (
                <div key={key}>
                  {image(
                    key,
                    draft.v2?.[key as keyof typeof draft.v2] as
                      string | undefined,
                    (v) => update({ [key]: v }),
                  )}
                </div>
              ))}
              <label className="flex min-h-12 gap-3">
                <input
                  type="checkbox"
                  checked={draft.v2.enabled}
                  onChange={(e) => update({ enabled: e.target.checked })}
                />
                활성화
              </label>
              <label className="flex min-h-12 gap-3">
                <input
                  type="checkbox"
                  checked={draft.v2.visible}
                  onChange={(e) => update({ visible: e.target.checked })}
                />
                공개 목록 표시
              </label>
            </div>
          )}
          {tab === "층" && (
            <div className="space-y-4">
              {draft.v2.floors.map((f, index) => {
                const change = (p: Partial<TowerFloor>) =>
                  update({
                    floors: draft.v2!.floors.map((x, i) =>
                      i === index ? { ...x, ...p } : x,
                    ),
                  });
                return (
                  <fieldset
                    key={f.id}
                    className="min-w-0 space-y-3 border border-neutral-700 p-3"
                  >
                    <legend>{f.number}층</legend>
                    <select
                      className={input}
                      value={f.type}
                      onChange={(e) => change({ type: e.target.value as any })}
                    >
                      <option value="NORMAL">일반 전투</option>
                      <option value="BOSS">보스 전투</option>
                    </select>
                    {f.type === "BOSS" ? (
                      <select
                        className={input}
                        value={f.bossId ?? ""}
                        onChange={(e) => change({ bossId: e.target.value })}
                      >
                        <option value="">보스 선택</option>
                        {draft.v2!.bosses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <p>일반 적 덱은 자동 생성됩니다.</p>
                        {f.enemies.map((enemy, n) => (
                          <div
                            key={enemy.id}
                            className="space-y-2 border-b border-neutral-700 pb-3"
                          >
                            {field("표시 이름", enemy.name, (v) =>
                              change({
                                enemies: f.enemies.map((x, i) =>
                                  i === n ? { ...x, name: v } : x,
                                ),
                              }),
                            )}
                            <select
                              className={input}
                              value={enemy.championId}
                              onChange={(e) =>
                                change({
                                  enemies: f.enemies.map((x, i) =>
                                    i === n
                                      ? { ...x, championId: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            >
                              {champions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            {difficulty(enemy.difficulty, (v) =>
                              change({
                                enemies: f.enemies.map((x, i) =>
                                  i === n ? { ...x, difficulty: v } : x,
                                ),
                              }),
                            )}
                            {field(
                              "등장 가중치",
                              enemy.weight,
                              (v) =>
                                change({
                                  enemies: f.enemies.map((x, i) =>
                                    i === n ? { ...x, weight: v } : x,
                                  ),
                                }),
                              "number",
                            )}
                            <button
                              className={input}
                              onClick={() =>
                                change({
                                  enemies: f.enemies.filter((_, i) => i !== n),
                                })
                              }
                            >
                              후보 제거
                            </button>
                          </div>
                        ))}
                        <button
                          className={input}
                          onClick={() =>
                            change({
                              enemies: [
                                ...f.enemies,
                                {
                                  id: crypto.randomUUID(),
                                  name: "일반 적",
                                  championId: champions[0]?.id ?? "",
                                  difficulty: "NORMAL",
                                  weight: 100,
                                },
                              ],
                            })
                          }
                        >
                          적 후보 추가
                        </button>
                      </>
                    )}
                    <label className="flex min-h-12 gap-3">
                      <input
                        type="checkbox"
                        checked={f.relicReward}
                        onChange={(e) =>
                          change({ relicReward: e.target.checked })
                        }
                      />
                      승리 후 유물 선택
                    </label>
                    {scene("전투 전 컷씬", f.sceneId, (v) =>
                      change({ sceneId: v }),
                    )}
                    {field("전투 배경 주소", f.backgroundUrl ?? "", (v) =>
                      change({ backgroundUrl: v || undefined }),
                    )}
                    <TowerMusicEditor
                      label="층 OST"
                      value={f.music}
                      onChange={(music) => change({ music })}
                    />
                    <label className="flex min-h-12 gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(f.rarityWeights)}
                        onChange={(e) =>
                          change({
                            rarityWeights: e.target.checked
                              ? { ...draft.v2!.rarityWeights }
                              : undefined,
                          })
                        }
                      />
                      층별 카드 희귀도 확률
                    </label>
                    {f.rarityWeights &&
                      Object.entries(f.rarityWeights).map(([key, value]) => (
                        <div key={key}>
                          {field(
                            key + " %",
                            value,
                            (v) =>
                              change({
                                rarityWeights: {
                                  ...f.rarityWeights!,
                                  [key]: v,
                                },
                              }),
                            "number",
                          )}
                        </div>
                      ))}
                    <button
                      className={input}
                      onClick={() =>
                        update({
                          floors: draft
                            .v2!.floors.filter((_, i) => i !== index)
                            .map((x, i) => ({ ...x, number: i + 1 })),
                        })
                      }
                    >
                      층 제거 · 나머지 번호 자동 정렬
                    </button>
                  </fieldset>
                );
              })}
              <button
                className={input}
                onClick={() =>
                  update({
                    floors: [
                      ...draft.v2!.floors,
                      {
                        id: crypto.randomUUID(),
                        number: draft.v2!.floors.length + 1,
                        type: "NORMAL",
                        enemies: [],
                        relicReward: false,
                      },
                    ],
                  })
                }
              >
                층 추가
              </button>
            </div>
          )}
          {tab === "보스" && (
            <div className="space-y-4">
              {draft.v2.bosses.map((b, index) => {
                const change = (p: Partial<TowerBoss>) =>
                  update({
                    bosses: draft.v2!.bosses.map((x, i) =>
                      i === index ? { ...x, ...p } : x,
                    ),
                  });
                return (
                  <fieldset
                    key={b.id}
                    className="min-w-0 space-y-3 border border-neutral-700 p-3"
                  >
                    <legend>{b.name}</legend>
                    {field("이름", b.name, (v) => change({ name: v }))}
                    <select
                      className={input}
                      value={b.championId}
                      onChange={(e) => change({ championId: e.target.value })}
                    >
                      {champions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {difficulty(b.difficulty, (v) => change({ difficulty: v }))}
                    {field(
                      "시작 체력",
                      b.startingHealth,
                      (v) => change({ startingHealth: v }),
                      "number",
                    )}
                    {field(
                      "최대 체력",
                      b.maxHealth,
                      (v) => change({ maxHealth: v }),
                      "number",
                    )}
                    {deck(b.cardIds, (cardIds) => change({ cardIds }))}
                    {scene("등장 컷씬", b.sceneId, (v) =>
                      change({ sceneId: v }),
                    )}
                    {field("배경 주소", b.backgroundUrl ?? "", (v) =>
                      change({ backgroundUrl: v || undefined }),
                    )}
                    <TowerMusicEditor
                      label="보스 OST"
                      value={b.music}
                      onChange={(music) => change({ music })}
                    />
                    <h4>특수 능력 · 등록 순서 / 우선순위</h4>
                    <TowerEffectEditor
                      cards={cards}
                      effects={b.abilities ?? []}
                      onChange={(abilities) => change({ abilities })}
                    />
                    <h4>최초 보상</h4>
                    {rewards(b.firstRewards, (firstRewards) =>
                      change({ firstRewards }),
                    )}
                    <h4>반복 보상</h4>
                    {rewards(b.repeatRewards, (repeatRewards) =>
                      change({ repeatRewards }),
                    )}
                    <button
                      className={input}
                      onClick={() =>
                        update({
                          bosses: draft.v2!.bosses.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      보스 제거
                    </button>
                  </fieldset>
                );
              })}
              <button
                className={input}
                onClick={() =>
                  update({
                    bosses: [
                      ...draft.v2!.bosses,
                      {
                        id: crypto.randomUUID(),
                        name: "새 보스",
                        championId: champions[0]?.id ?? "",
                        cardIds: [],
                        difficulty: "NORMAL",
                        startingHealth: 30,
                        maxHealth: 30,
                        firstRewards: [],
                        repeatRewards: [],
                      },
                    ],
                  })
                }
              >
                보스 추가
              </button>
            </div>
          )}
          {tab === "컷씬·히든" && (
            <div className="space-y-3">
              {scene("오프닝", draft.v2.openingSceneId, (v) =>
                update({ openingSceneId: v }),
              )}
              {scene("일반 엔딩", draft.v2.endingSceneId, (v) =>
                update({ endingSceneId: v }),
              )}
              {scene("히든 엔딩", draft.v2.hiddenEndingSceneId, (v) =>
                update({ hiddenEndingSceneId: v }),
              )}
              <label>
                히든 보스
                <select
                  className={input}
                  value={draft.v2.hiddenBossId ?? ""}
                  onChange={(e) =>
                    update({ hiddenBossId: e.target.value || undefined })
                  }
                >
                  <option value="">없음</option>
                  {draft.v2.bosses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                히든 조건 · ALL / ANY / CHAMPION / CARD / RELIC / STARTER /
                CLEAR_COUNT / BOSS_CLEARED
                <textarea
                  className={input + " min-h-40 font-mono text-xs"}
                  defaultValue={JSON.stringify(
                    draft.v2.hiddenCondition ?? null,
                    null,
                    2,
                  )}
                  onBlur={(e) => {
                    try {
                      update({
                        hiddenCondition:
                          JSON.parse(e.target.value) ?? undefined,
                      });
                      setMessage("");
                    } catch {
                      setMessage("히든 조건 JSON 형식을 확인하세요.");
                    }
                  }}
                />
              </label>
            </div>
          )}
          {tab === "확률" && (
            <div>
              {Object.entries(draft.v2.rarityWeights).map(([key, value]) => (
                <div key={key}>
                  {field(
                    key + " %",
                    value,
                    (v) =>
                      update({
                        rarityWeights: { ...draft.v2!.rarityWeights, [key]: v },
                      }),
                    "number",
                  )}
                </div>
              ))}
              <p>합계 100% · 무작위 2장과 시너지 1장에 동일 적용</p>
            </div>
          )}
          {tab === "공개·테스트" && (
            <div className="space-y-3">
              <button
                className={input}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await request(
                      "/tower/seasons/" + draft.id,
                      { data: draft, active: false },
                      "PUT",
                    );
                    await request("/tower/validate", { towerId: draft.id });
                    setMessage("공개 전 검증 PASS");
                  })
                }
              >
                저장 후 공개 전 검증
              </button>
              <button
                className={input}
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await request(
                      "/tower/seasons/" + draft.id,
                      { data: draft, active: false },
                      "PUT",
                    );
                    const r = await request(
                      "/tower/v2/" + draft.id + "/publish",
                      {},
                    );
                    setMessage("공개 버전 " + r.version + " 저장");
                  })
                }
              >
                새 불변 버전 공개
              </button>
              <button
                className={input}
                onClick={() =>
                  void work(async () => {
                    const r = await request(
                      "/tower/v2/" + draft.id + "/versions",
                    );
                    setVersions(r.versions);
                  })
                }
              >
                공개 버전 조회
              </button>
              {versions.map((v) => (
                <p key={v.id}>
                  버전 {v.version} · {v.createdAt}
                </p>
              ))}
              <button
                className={input}
                onClick={() =>
                  void work(async () => {
                    const archived = {
                      ...draft,
                      v2: { ...draft.v2!, enabled: false, visible: false },
                    };
                    await request(
                      "/tower/seasons/" + draft.id,
                      { data: archived, active: false },
                      "PUT",
                    );
                    setDraft(archived);
                    setMessage("보관 처리 · 기존 기록 유지");
                  })
                }
              >
                보관 · 신규 진입 중단
              </button>
              <fieldset className="space-y-3 border border-neutral-700 p-3">
                <legend>선택 층 · 적 · 보스 테스트</legend>
                <label>
                  스타터
                  <select
                    className={input}
                    value={testStarter}
                    onChange={(e) => setTestStarter(e.target.value)}
                  >
                    <option value="">선택</option>
                    {starters
                      .filter((s) => s.data.enabled)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.data.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  테스트 챔피언
                  <select
                    className={input}
                    value={testChampion}
                    onChange={(e) => setTestChampion(e.target.value)}
                  >
                    <option value="">스타터 기본값</option>
                    {champions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {field("시작 층", testFloor, setTestFloor, "number")}
                <label>
                  해당 층의 일반 적
                  <select
                    className={input}
                    value={testEnemy}
                    onChange={(e) => {
                      setTestEnemy(e.target.value);
                      setTestBoss("");
                    }}
                  >
                    <option value="">기본 선정</option>
                    {draft.v2.floors
                      .find((f) => f.number === testFloor)
                      ?.enemies.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  보스 직접 지정
                  <select
                    className={input}
                    value={testBoss}
                    onChange={(e) => {
                      setTestBoss(e.target.value);
                      setTestEnemy("");
                    }}
                  >
                    <option value="">층 설정 사용</option>
                    {draft.v2.bosses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={testHidden}
                    onChange={(e) => setTestHidden(e.target.checked)}
                  />{" "}
                  히든 보스 직접 테스트
                </label>
                <div>
                  테스트 유물
                  {relics
                    .filter((r) => r.data.enabled)
                    .map((r) => (
                      <label
                        key={r.id}
                        className="flex min-h-12 items-center gap-3"
                      >
                        <input
                          type="checkbox"
                          checked={testRelics.includes(r.id)}
                          onChange={(e) =>
                            setTestRelics(
                              e.target.checked
                                ? [...testRelics, r.id]
                                : testRelics.filter((x) => x !== r.id),
                            )
                          }
                        />
                        {r.data.name}
                      </label>
                    ))}
                </div>
                <details>
                  <summary>별도 테스트 덱 · {testDeck.length}/25</summary>
                  {deck(testDeck, setTestDeck)}
                </details>
                <button
                  className={input}
                  disabled={
                    !testStarter ||
                    busy ||
                    (testDeck.length > 0 && testDeck.length !== 25)
                  }
                  onClick={() =>
                    void work(async () => {
                      await request(
                        "/tower/seasons/" + draft.id,
                        { data: draft, active: false },
                        "PUT",
                      );
                      const r = await request("/tower/test/runs", {
                        towerId: draft.id,
                        starterId: testStarter,
                        championId: testChampion || undefined,
                        floor: testFloor,
                        hidden: testHidden,
                        enemyId: testEnemy || undefined,
                        bossId: testBoss || undefined,
                        relicIds: testRelics,
                        deck: testDeck.length ? testDeck : undefined,
                        seed: crypto.randomUUID(),
                      });
                      window.location.assign(
                        "/tower?towerTest=1&run=" +
                          encodeURIComponent(r.run.id),
                      );
                    })
                  }
                >
                  보상 없는 진단 시작
                </button>
              </fieldset>
              <label>
                테스트 스타터
                <select
                  className={input}
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const starterId = e.target.value;
                    void work(async () => {
                      await request(
                        "/tower/seasons/" + draft.id,
                        { data: draft, active: false },
                        "PUT",
                      );
                      const r = await request("/tower/test/runs", {
                        towerId: draft.id,
                        starterId,
                        fullMode: true,
                        floor: 1,
                        seed: crypto.randomUUID(),
                        hidden: false,
                        relicIds: [],
                      });
                      window.location.assign(
                        "/tower?towerTest=1&run=" +
                          encodeURIComponent(r.run.id),
                      );
                    });
                  }}
                >
                  <option value="">1층부터 테스트 시작 · 계정 보상 없음</option>
                  {starters
                    .filter((s) => s.data.enabled)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.data.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <button
            className={input + " border-primary font-bold text-primary"}
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await request(
                  "/tower/seasons/" + draft.id,
                  { data: draft, active: false },
                  "PUT",
                );
                setMessage("초안 저장 · 기존 공개 버전 유지");
              })
            }
          >
            초안 저장
          </button>
        </>
      )}
      {message && (
        <p role="status" className="break-words">
          {message}
        </p>
      )}
    </section>
  );
}

import {AdminEditorSections} from './admin-editor-sections';
import { useState, useEffect, useRef } from "react";
import {
  ACTION_SCHEMAS,
  DISPLAY_LABELS,
  KEYWORDS,
} from "@workspace/effect-registry";
import {
  TOWER_EFFECT_LIBRARY,
  towerEffectTargetZones,
  TOWER_EFFECT_EVENTS,
  describeTowerEffect,
  type TowerConfiguredEffect,
} from "../../../../lib/game-engine/src/tower/effects";
const control =
  "min-h-12 w-full min-w-0 border border-neutral-600 bg-black px-3 py-2 text-base";
export function newTowerEffect(): TowerConfiguredEffect {
  return {
    id: crypto.randomUUID(),
    name: "새 효과",
    enabled: true,
    event: "TURN_STARTED",
    eventOwner: "SELF",
    action: "ADD_GOLD",
    values: { amount: 1 },
    priority: 0,
    duration: "BATTLE",
    limit: { scope: "TURN", count: 1 },
  };
}
function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: any) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2)),
    [error, setError] = useState("");
  const serialized = JSON.stringify(value ?? {}, null, 2);
  const last = useRef(serialized);
  useEffect(() => {
    if (serialized !== last.current) {
      last.current = serialized;
      setText(serialized);
      setError("");
    }
  }, [serialized]);
  return (
    <label className="block">
      {label}
      <textarea
        className={control + " min-h-32 font-mono text-xs"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            last.current = JSON.stringify(parsed, null, 2);
            onChange(parsed);
            setError("");
          } catch {
            setError("JSON 형식을 확인하세요.");
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
export function TowerEffectEditor({
  effects,
  onChange,
  cards = [],
}: {
  cards?: { id: string; name: string }[];
  effects: TowerConfiguredEffect[];
  onChange: (effects: TowerConfiguredEffect[]) => void;
}) {
  const update = (index: number, patch: Partial<TowerConfiguredEffect>) =>
    onChange(effects.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  return (
    <div className="admin-effect-list min-w-0 space-y-4" data-testid="tower-effect-editor">
      {effects.map((e, i) => {
        const schema = ACTION_SCHEMAS[e.action];
        return (
          <fieldset
            key={e.id}
            className="min-w-0 space-y-3 border border-neutral-700 p-3"
          >
            <legend>효과 {i + 1}</legend>
            <AdminEditorSections panels={[{id:e.id+'-section-0',label:"기본 · 발동"},{id:e.id+'-section-1',label:"대상 · 효과"},{id:e.id+'-section-2',label:"조건"},{id:e.id+'-section-3',label:"지속 · 횟수"}]}>{[<><label>
              이름
              <input
                className={control}
                value={e.name}
                onChange={(v) => update(i, { name: v.target.value })}
              />
            </label>
<label>아이콘 URL<input className={control} value={e.iconUrl??""} onChange={v=>update(i,{iconUrl:v.target.value||undefined})}/></label>
<label className="flex min-h-12 items-center gap-2">
              <input
                type="checkbox"
                checked={e.enabled}
                onChange={(v) => update(i, { enabled: v.target.checked })}
              />
              활성화
            </label>
<label>
              발동 시점
              <select
                className={control}
                value={e.event}
                onChange={(v) => update(i, { event: v.target.value as any })}
              >
                {TOWER_EFFECT_EVENTS.map((event) => (
                  <option key={event}>{event}</option>
                ))}
              </select>
            </label>
<label>
              이벤트 주체
              <select
                className={control}
                value={e.eventOwner}
                onChange={(v) =>
                  update(i, { eventOwner: v.target.value as any })
                }
              >
                <option value="SELF">내 이벤트</option>
                <option value="ENEMY">상대 이벤트</option>
                <option value="ANY">양측</option>
              </select>
            </label></>,
<><label>
              효과 라이브러리
              <select
                className={control}
                value={e.action}
                onChange={(v) => {
                  const action = v.target
                      .value as TowerConfiguredEffect["action"],
                    s = ACTION_SCHEMAS[action];
                  update(i, {
                    action,
                    duration: "BATTLE",
                    values: {
                      ...(s.amount ? { amount: 1 } : {}),
                      ...(s.stats ? { attack: 1, health: 1 } : {}),
                      ...(s.stat ? { stat: "ATTACK" } : {}),
                      ...(s.keyword ? { keyword: "ARMOR" } : {}),
                    },
                    target: s.target
                      ? {
                          zone: towerEffectTargetZones(action)[0] as any,
                          owner: "SELF",
                          selection: "ALL",
                          count: 4,
                        }
                      : undefined,
                  });
                }}
              >
                {TOWER_EFFECT_LIBRARY.map((d) => (
                  <option key={d.effect_type} value={d.effect_type}>
                    {(DISPLAY_LABELS as any)[d.effect_type] ?? d.effect_type}
                  </option>
                ))}
              </select>
            </label>
{schema.target && (
              <>
                <label>
                  대상 존
                  <select
                    className={control}
                    value={e.target?.zone ?? "BOARD"}
                    onChange={(v) =>
                      update(i, {
                        target: { ...e.target!, zone: v.target.value as any },
                      })
                    }
                  >
                    {towerEffectTargetZones(e.action).map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label>
                  대상 소유자
                  <select
                    className={control}
                    value={e.target?.owner ?? "SELF"}
                    onChange={(v) =>
                      update(i, {
                        target: { ...e.target!, owner: v.target.value as any },
                      })
                    }
                  >
                    <option value="SELF">아군</option>
                    <option value="ENEMY">상대</option>
                    <option value="ALL">양측 카드</option>
                  </select>
                </label>
                <label>
                  선정
                  <select
                    className={control}
                    value={e.target?.selection ?? "ALL"}
                    onChange={(v) =>
                      update(i, {
                        target: {
                          ...e.target!,
                          selection: v.target.value as any,
                        },
                      })
                    }
                  >
                    {["ALL", "RANDOM", "TOP", "SELF"].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label>
                  대상 수
                  <input
                    className={control}
                    type="number"
                    min={1}
                    value={e.target?.count ?? 4}
                    onChange={(v) =>
                      update(i, {
                        target: { ...e.target!, count: Number(v.target.value) },
                      })
                    }
                  />
                </label>
                <details>
                  <summary>대상 필터 / 고급 설정</summary>
                  <JsonField
                    key="target"
                    label="대상 정의"
                    value={e.target}
                    onChange={(target) => update(i, { target })}
                  />
                </details>
              </>
            )}
{schema.amount && (
              <label>
                수치
                <input
                  className={control}
                  type="number"
                  value={Number(e.values.amount ?? 1)}
                  onChange={(v) =>
                    update(i, {
                      values: { ...e.values, amount: Number(v.target.value) },
                    })
                  }
                />
              </label>
            )}
{schema.stats &&
              ["attack", "health"].map((key) => (
                <label key={key}>
                  {key === "attack" ? "공격력" : "체력"}
                  <input
                    className={control}
                    type="number"
                    value={Number(e.values[key] ?? 0)}
                    onChange={(v) =>
                      update(i, {
                        values: { ...e.values, [key]: Number(v.target.value) },
                      })
                    }
                  />
                </label>
              ))}
{schema.stat && (
              <label>
                변경할 능력치
                <select
                  className={control}
                  value={String(e.values.stat ?? "ATTACK")}
                  onChange={(v) =>
                    update(i, { values: { ...e.values, stat: v.target.value } })
                  }
                >
                  {["ATTACK", "HEALTH", "COST"].map((stat) => (
                    <option key={stat}>{stat}</option>
                  ))}
                </select>
              </label>
            )}
{schema.cardDefinition && (
              <label>
                대상 카드
                <select
                  className={control}
                  value={String(
                    (e.values.definitionRef as { id?: string } | undefined)
                      ?.id ?? "",
                  )}
                  onChange={(v) =>
                    update(i, {
                      values: {
                        ...e.values,
                        definitionRef: { id: v.target.value },
                      },
                    })
                  }
                >
                  <option value="">카드 선택</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
{schema.cardCount && (
              <label>
                카드 수
                <input
                  type="number"
                  min={1}
                  max={20}
                  className={control}
                  value={Number(e.values.count ?? 1)}
                  onChange={(v) =>
                    update(i, {
                      values: { ...e.values, count: Number(v.target.value) },
                    })
                  }
                />
              </label>
            )}
{schema.destination && (
              <label>
                이동 위치
                <select
                  className={control}
                  value={String(e.values.destination ?? "HAND")}
                  onChange={(v) =>
                    update(i, {
                      values: { ...e.values, destination: v.target.value },
                    })
                  }
                >
                  {["HAND", "DECK"].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
            )}
{schema.keyword && (
              <label>
                키워드
                <select
                  className={control}
                  value={String(e.values.keyword ?? "ARMOR")}
                  onChange={(v) =>
                    update(i, {
                      values: { ...e.values, keyword: v.target.value },
                    })
                  }
                >
                  {KEYWORDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            )}
<details>
              <summary>효과 파라미터</summary>
              <JsonField
                key={e.action}
                label="파라미터 정의"
                value={e.values}
                onChange={(values) => update(i, { values })}
              />
            </details></>,
<><details>
              <summary>조건 · AND/OR</summary>
              <button
                type="button"
                className={control}
                onClick={() =>
                  update(i, {
                    condition: {
                      type: "ALL",
                      conditions: [
                        {
                          type: "NUMBER",
                          field: "CHAMPION_HP",
                          compare: "LTE",
                          value: 5,
                        },
                      ],
                    },
                  })
                }
              >
                체력 5 이하 조건 넣기
              </button>
              <JsonField
                key="condition"
                label="조건 정의"
                value={e.condition ?? null}
                onChange={(condition) =>
                  update(i, { condition: condition ?? undefined })
                }
              />
            </details></>,
<><label>
              지속시간
              <select
                className={control}
                value={e.duration}
                onChange={(v) => update(i, { duration: v.target.value as any })}
              >
                <option value="BATTLE">해당 전투</option>
                {["BUFF","MODIFY_STAT","MODIFY_MAX_HEALTH","REDUCE_COST","INCREASE_COST","SET_STAT","SET_STATS"].includes(e.action) && <option value="RUN">런 전체 · 내 덱 능력치/비용</option>}
              </select>
            </label>
<label>
              발동 제한
              <select
                className={control}
                value={e.limit.scope}
                onChange={(v) =>
                  update(i, {
                    limit: { ...e.limit, scope: v.target.value as any },
                  })
                }
              >
                {["UNLIMITED", "TURN", "BATTLE", "RUN"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
<label>
              횟수
              <input
                className={control}
                type="number"
                min={1}
                value={e.limit.count}
                onChange={(v) =>
                  update(i, {
                    limit: { ...e.limit, count: Number(v.target.value) },
                  })
                }
              />
            </label>
<label>
              우선순위
              <input
                className={control}
                type="number"
                value={e.priority}
                onChange={(v) =>
                  update(i, { priority: Number(v.target.value) })
                }
              />
            </label></>]}</AdminEditorSections>
            <p className="break-words text-sm text-neutral-300">
              {describeTowerEffect(e)}
            </p>
            <button
              type="button"
              className={control}
              onClick={() => onChange(effects.filter((_, n) => n !== i))}
            >
              효과 제거
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        className={control}
        onClick={() => onChange([...effects, newTowerEffect()])}
      >
        효과 추가
      </button>
    </div>
  );
}

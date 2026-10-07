import { useMemo, useState } from "react";
import {
  createDailyQuest,
  updateDailyQuest,
  type RewardAdminData,
  type RewardCatalogCard,
  type RewardCatalogChampion,
  type RewardCatalogPack,
} from "@/lib/rewards-client";
import {
  validateQuestCondition,
  QUEST_CONDITION_SCHEMA_VERSION,
} from "@workspace/game-engine";

type Definition = RewardAdminData["dailyQuests"][number];
export const questObjectives: Record<string, { label: string; unit: string }> =
  {
    PLAY_MATCH: { label: "경기 완료", unit: "회" },
    WIN_MATCH: { label: "경기 승리", unit: "회" },
    CARD_PLAYED: { label: "카드 사용", unit: "장" },
    TECHNIQUE_PLAYED: { label: "주문 사용", unit: "장" },
    ATTACK_DECLARED: { label: "공격 선언", unit: "회" },
    DAMAGE_DEALT: { label: "피해량 누적", unit: "피해" },
  };
const rewards: Record<string, string> = {
  CURRENCY: "크레딧",
  CARD: "카드",
  CHAMPION: "챔피언",
  PACK: "카드 팩",
};
const blank = {
  title: "",
  description: "",
  objectiveType: "PLAY_MATCH",
  cardType: "",
  targetValue: "1",
  rewardType: "CURRENCY",
  rewardTargetId: "",
  rewardAmount: "",
  enabled: true,
};
const input =
  "mt-1 min-h-11 w-full border border-neutral-700 bg-black px-3 py-2 text-sm text-white";
export function DailyQuestEditor({
  definitions,
  catalog,
  onSaved,
}: {
  definitions: Definition[];
  catalog: {
    cards: RewardCatalogCard[];
    champions: RewardCatalogChampion[];
    packs: RewardCatalogPack[];
  };
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(blank),
    [editing, setEditing] = useState<string | null>(null),
    [advanced, setAdvanced] = useState(false),
    [raw, setRaw] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [applyUnstarted, setApplyUnstarted] = useState(false);
  const update = (key: keyof typeof blank, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const parsed = useMemo(() => {
    if (!advanced) return null;
    try {
      return validateQuestCondition(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [advanced, raw]);
  const targets =
    form.rewardType === "CARD"
      ? catalog.cards.filter((c) => !c.isToken && !c.isChampionToken)
      : form.rewardType === "CHAMPION"
        ? catalog.champions
        : catalog.packs;
  const objective = questObjectives[form.objectiveType];
  const summary = advanced
    ? parsed
      ? "추가 조건 · " +
        parsed.required +
        " / " +
        (parsed.progress.mode === "SUM" ? "수치 합계" : "발생 횟수")
      : "추가 조건을 확인하세요."
    : (form.cardType === "WRESTLER"
        ? "선수 사용"
        : (objective?.label ?? form.objectiveType)) +
      " " +
      form.targetValue +
      " " +
      (objective?.unit ?? "회");
  function edit(item: Definition, copy = false) {
    setApplyUnstarted(false);
    setEditing(copy ? null : item.id);
    setForm({
      title: item.title + (copy ? " (복사)" : ""),
      description: item.description,
      objectiveType: item.objectiveType,
      cardType: item.cardType ?? "",
      targetValue: String(item.targetValue),
      rewardType: item.rewardType,
      rewardTargetId: item.rewardTargetId ?? "",
      rewardAmount: String(item.rewardAmount),
      enabled: item.enabled,
    });
    setAdvanced(item.schemaVersion === QUEST_CONDITION_SCHEMA_VERSION);
    setRaw(
      JSON.stringify(
        item.condition ?? {
          schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
          condition: { event: "CARD_PLAYED" },
          progress: { mode: "COUNT" },
          required: item.targetValue,
        },
        null,
        2,
      ),
    );
    setMessage("");
  }
  function reset() {
    setApplyUnstarted(false);
    setEditing(null);
    setForm(blank);
    setAdvanced(false);
    setRaw("");
    setMessage("");
  }
  function body() {
    const targetValue = Number(form.targetValue),
      rewardAmount = Number(form.rewardAmount);
    if (!form.title.trim()) throw new Error("퀘스트 제목을 입력하세요.");
    if (
      !Number.isSafeInteger(targetValue) ||
      targetValue < 1 ||
      targetValue > 1000
    )
      throw new Error("목표 수치는 1~1,000의 정수로 입력하세요.");
    if (!Number.isSafeInteger(rewardAmount) || rewardAmount < 1)
      throw new Error("보상 수량은 1 이상의 정수로 입력하세요.");
    if (form.rewardType !== "CURRENCY" && !form.rewardTargetId)
      throw new Error("지급할 보상을 선택하세요.");
    if (advanced && (!parsed || parsed.required !== targetValue))
      throw new Error("추가 조건의 목표(required)와 목표 수치를 맞춰 주세요.");
    return {
      ...form,
      applyToUnstartedAssignments: editing !== null && applyUnstarted,
      title: form.title.trim(),
      description: form.description.trim() || summary,
      cardType:
        form.objectiveType === "CARD_PLAYED" ? form.cardType || null : null,
      targetValue,
      rewardAmount,
      rewardTargetId:
        form.rewardType === "CURRENCY" ? null : form.rewardTargetId,
      schemaVersion: advanced
        ? QUEST_CONDITION_SCHEMA_VERSION
        : "QUEST_CONDITION_V1",
      condition: advanced ? parsed : null,
    };
  }
  async function save() {
    setBusy(true);
    try {
      const payload = body();
      if (editing) await updateDailyQuest(editing, payload);
      else await createDailyQuest(payload);
      await onSaved();
      reset();
      setMessage(
        "저장했습니다. 이미 배정된 퀘스트의 진행도와 보상은 유지됩니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(item: Definition) {
    setBusy(true);
    try {
      await updateDailyQuest(item.id, { ...item, enabled: !item.enabled });
      await onSaved();
      setMessage(
        item.enabled
          ? "새 배정을 중지했습니다. 이미 배정된 퀘스트는 계속 완료할 수 있습니다."
          : "새 배정을 활성화했습니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  const shown = definitions.filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "ALL" || (filter === "ON" ? item.enabled : !item.enabled)),
  );
  return (
    <section
      className="border border-neutral-800 bg-black p-4 sm:p-5"
      data-testid="daily-quest-editor"
    >
      <header>
        <h3 className="text-lg font-black text-amber-200">일반 퀘스트 관리</h3>
        <p className="mt-2 text-xs leading-5 text-neutral-400">
          AI 빠른 대전 · 온라인 · 드래프트의 실제 경기 기록으로 진행합니다. 하루
          최대 3개가 배정됩니다. 수정은 이후 배정에 적용되며 이미 배정된
          진행도·보상은 유지됩니다.
        </p>
      </header>
      <p className="mt-3 text-xs text-neutral-400">
        전체 {definitions.length}개 · 배정 활성{" "}
        {definitions.filter((d) => d.enabled).length}개
      </p>
      {message && (
        <p
          role="status"
          className="my-3 border-l-2 border-amber-500 px-3 py-2 text-sm text-amber-200"
        >
          {message}
        </p>
      )}
      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="text-xs font-bold text-neutral-300">
          제목
          <input
            aria-label="퀘스트 제목"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className={input}
          />
        </label>
        <label className="text-xs font-bold text-neutral-300">
          달성 조건
          <select
            aria-label="달성 조건"
            value={form.objectiveType}
            onChange={(e) => {
              update("objectiveType", e.target.value);
              update("cardType", "");
              setAdvanced(false);
            }}
            className={input}
          >
            {Object.entries(questObjectives).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        {form.objectiveType === "CARD_PLAYED" && (
          <label className="text-xs font-bold text-neutral-300">
            카드 종류
            <select
              aria-label="카드 종류"
              value={form.cardType}
              onChange={(e) => update("cardType", e.target.value)}
              className={input}
            >
              <option value="">모든 카드</option>
              <option value="WRESTLER">선수</option>
              <option value="TECHNIQUE">주문</option>
            </select>
          </label>
        )}
        <label className="text-xs font-bold text-neutral-300">
          목표 수치 ({objective?.unit ?? "회"})
          <input
            aria-label="목표 수치"
            type="number"
            min="1"
            max="1000"
            value={form.targetValue}
            onChange={(e) => update("targetValue", e.target.value)}
            className={input}
          />
        </label>
        <label className="text-xs font-bold text-neutral-300">
          보상 종류
          <select
            aria-label="보상 종류"
            value={form.rewardType}
            onChange={(e) => {
              update("rewardType", e.target.value);
              update("rewardTargetId", "");
            }}
            className={input}
          >
            {Object.entries(rewards).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {form.rewardType !== "CURRENCY" && (
          <label className="text-xs font-bold text-neutral-300">
            지급할 보상
            <select
              aria-label="지급할 보상"
              value={form.rewardTargetId}
              onChange={(e) => update("rewardTargetId", e.target.value)}
              className={input}
            >
              <option value="">선택하세요</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-bold text-neutral-300">
          보상 수량
          <input
            aria-label="보상 수량"
            type="number"
            min="1"
            value={form.rewardAmount}
            onChange={(e) => update("rewardAmount", e.target.value)}
            className={input}
          />
        </label>
        <label className="text-xs font-bold text-neutral-300 sm:col-span-2">
          설명 (비워두면 조건 설명 자동 입력)
          <textarea
            aria-label="퀘스트 설명"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={input}
          />
        </label>
        <p
          data-testid="quest-condition-preview"
          className="border-l-2 border-amber-700 px-3 py-2 text-sm text-amber-200 sm:col-span-2"
        >
          달성: {summary} · 보상: {rewards[form.rewardType]}{" "}
          {form.rewardAmount || "미설정"}
          {form.rewardType === "CURRENCY" ? "" : "개"}
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          새 배정에 사용
        </label>
        {editing && (
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={applyUnstarted}
              onChange={(e) => setApplyUnstarted(e.target.checked)}
            />
            오늘 배정된 진행도 0 퀘스트에도 적용 (진행 중·완료·수령 기록 유지)
          </label>
        )}
        <details className="sm:col-span-2" open={advanced}>
          <summary className="cursor-pointer text-xs text-neutral-400">
            추가 조건 (기존 복합 조건 보존)
          </summary>
          <label className="my-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) => {
                setAdvanced(e.target.checked);
                if (!raw)
                  setRaw(
                    JSON.stringify(
                      {
                        schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
                        condition: { event: "CARD_PLAYED" },
                        progress: { mode: "COUNT" },
                        required: Number(form.targetValue),
                      },
                      null,
                      2,
                    ),
                  );
              }}
            />
            추가 조건 사용
          </label>
          {advanced && (
            <>
              <textarea
                aria-label="추가 조건"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className={input + " min-h-48 font-mono"}
              />
              <p className="mt-2 text-xs text-neutral-400">
                추가 조건을 사용하면 기본 달성 조건 대신 이 조건만 집계합니다.
                기존 복합 조건은 그대로 저장됩니다. 일반 목표는 위 달성 조건만
                선택하면 됩니다.
              </p>
            </>
          )}
        </details>
        <div className="flex gap-2 sm:col-span-2">
          <button
            disabled={busy}
            type="submit"
            className="min-h-11 bg-amber-400 px-4 text-sm font-black text-black disabled:opacity-50"
          >
            {busy ? "저장 중…" : editing ? "퀘스트 수정" : "퀘스트 추가"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="min-h-11 border border-neutral-700 px-4 text-sm"
          >
            새로 작성
          </button>
        </div>
      </form>
      <div className="mt-6 flex gap-2">
        <input
          aria-label="퀘스트 검색"
          placeholder="퀘스트 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={input}
        />
        <select
          aria-label="활성 필터"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={input + " max-w-28"}
        >
          <option value="ALL">전체</option>
          <option value="ON">활성</option>
          <option value="OFF">비활성</option>
        </select>
      </div>
      <ul className="mt-3 divide-y divide-neutral-800">
        {shown.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div className="min-w-0">
              <strong className="text-sm">{item.title}</strong>
              <p className="mt-1 text-xs text-neutral-400">
                {questObjectives[item.objectiveType]?.label ??
                  "드래프트 누적 완료"}{" "}
                · 목표 {item.targetValue} · {rewards[item.rewardType]}{" "}
                {item.rewardAmount}
              </p>
            </div>
            {questObjectives[item.objectiveType] ? (
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => edit(item)}
                  className="min-h-10 border border-neutral-700 px-3 text-xs"
                >
                  수정
                </button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => edit(item, true)}
                  className="min-h-10 border border-neutral-700 px-3 text-xs"
                >
                  복사
                </button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => void toggle(item)}
                  className="min-h-10 border border-amber-900 px-3 text-xs text-amber-200"
                >
                  {item.enabled ? "배정 중지" : "배정 활성화"}
                </button>
              </div>
            ) : (
              <span className="text-xs text-neutral-500">
                상시 누적 퀘스트 · 자동 관리
              </span>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="py-5 text-sm text-neutral-500">
          조건에 맞는 퀘스트가 없습니다.
        </p>
      )}
    </section>
  );
}

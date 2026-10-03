import type {
  DraftConfig,
  CardDefinition,
  ChampionDefinition,
} from "@workspace/game-engine";

const input =
  "min-h-11 w-full min-w-0 rounded border border-neutral-700 bg-black px-3 text-base";
export function DraftConfigFields({
  config,
  onChange,
  cards,
  champions,
}: {
  config: DraftConfig;
  onChange: (config: DraftConfig) => void;
  cards: CardDefinition[];
  champions: ChampionDefinition[];
}) {
  const numberField = (
    key:
      | "championSeconds"
      | "pickSeconds"
      | "reviewSeconds"
      | "championTagWeight"
      | "deckTagWeight"
      | "supportWeight",
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label key={key} className="block min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      <input
        type="number"
        className={input}
        min={min}
        max={max}
        step={step}
        value={config[key]}
        onChange={(e) => onChange({ ...config, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const slots = (key: "techniquePicks" | "legendaryPicks", label: string) => (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-bold">{label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
          <label
            key={n}
            className="flex min-h-11 items-center justify-center gap-1 rounded border border-neutral-700 text-sm"
          >
            <input
              type="checkbox"
              aria-label={`${label} ${n}번째`}
              checked={config[key].includes(n)}
              onChange={(e) =>
                onChange({
                  ...config,
                  [key]: e.target.checked
                    ? [...config[key], n].sort((a, b) => a - b)
                    : config[key].filter((v) => v !== n),
                })
              }
            />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-neutral-400">
        저장한 규칙은 새 드래프트부터 적용됩니다.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">
          선택 순서 설정
        </summary>
        <div className="mt-2 space-y-4">
          {slots("techniquePicks", "기술 카드 우선 순서")}
          <p className="text-xs text-neutral-400">
            공개된 기술 카드가 부족하면 해당 순서에서 선수 카드를 선택합니다.
          </p>
          {slots("legendaryPicks", "레전더리 우선 순서")}
          <p className="text-xs text-neutral-400">
            레전더리 후보가 3장 이상일 때 적용됩니다. 덱 전체 최대 3장 제한은
            유지됩니다.
          </p>
        </div>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">
          제한 시간 · 비용 분포 · AI 설정
        </summary>
        <div className="mt-2 space-y-4">
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-bold">
              PvP 제한 시간 (5~300초)
            </legend>
            {numberField("championSeconds", "챔피언 선택 (초)", 5, 300)}
            {numberField("pickSeconds", "카드 선택 (초)", 5, 300)}
            {numberField("reviewSeconds", "덱 확인 (초)", 5, 300)}
          </fieldset>
          <fieldset className="grid min-w-0 grid-cols-3 gap-2">
            <legend className="mb-2 text-sm font-bold">
              비용별 목표 장수 · 합계{" "}
              {config.costTargets.reduce((a, b) => a + b, 0)}/25장
            </legend>
            {["0~2 코스트", "3~4 코스트", "5+ 코스트"].map((label, i) => (
              <label key={label} className="min-w-0 space-y-1 text-sm">
                <span>{label}</span>
                <input
                  type="number"
                  className={input}
                  min={0}
                  max={25}
                  step={1}
                  value={config.costTargets[i]}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      costTargets: config.costTargets.map((n, j) =>
                        j === i ? Number(e.target.value) : n,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-bold">
              후보 가중치 (1~3배)
            </legend>
            {numberField("championTagWeight", "챔피언 선호 태그", 1, 3, 0.05)}
            {numberField("deckTagWeight", "덱 태그 시너지", 1, 3, 0.05)}
            {numberField("supportWeight", "기술 카드", 1, 3, 0.05)}
          </fieldset>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              카드별 AI 점수 (-100~100)
            </summary>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {cards.map((c) => (
                <label
                  key={c.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 text-sm"
                >
                  <span className="break-words">{c.name}</span>
                  <input
                    type="number"
                    className={input}
                    aria-label={`${c.name} AI 점수`}
                    min={-100}
                    max={100}
                    step={1}
                    value={config.cardScores[c.id] ?? 0}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        cardScores: {
                          ...config.cardScores,
                          [c.id]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm">
              챔피언별 선호 태그
            </summary>
            <p className="mb-2 text-xs text-neutral-400">
              태그를 쉼표로 구분해서 입력하세요.
            </p>
            <div className="space-y-2">
              {champions.map((c) => (
                <label key={c.id} className="block min-w-0 space-y-1 text-sm">
                  <span>{c.name}</span>
                  <input
                    className={input}
                    placeholder="예: 좀비, 근육"
                    value={(config.championTags[c.id] ?? []).join(",")}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        championTags: {
                          ...config.championTags,
                          [c.id]: e.target.value.split(","),
                        },
                      })
                    }
                    onBlur={(e) =>
                      onChange({
                        ...config,
                        championTags: {
                          ...config.championTags,
                          [c.id]: e.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}

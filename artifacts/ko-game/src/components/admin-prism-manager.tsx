import { useEffect, useRef, useState } from "react";
import { adminFetch, errorText, Field, Grid, Notice, NumberInput, Panel, SaveLine, useAutosave } from "./admin-kit";

type Rarity = "NORMAL" | "EPIC" | "LEGENDARY";
type Setting = { rarity: Rarity; craftCost: number | null; disenchantReward: number | null; configured: boolean };
type ChampionSetting = { craftCost: number | null; duplicateReward: number | null; configured: boolean };
type Values = { cards: Record<Rarity, { craftCost: number | null; disenchantReward: number | null }>; champion: { craftCost: number | null; duplicateReward: number | null } };

const RARITIES: Array<[Rarity, string]> = [["NORMAL", "일반 카드"], ["EPIC", "에픽 카드"], ["LEGENDARY", "레전더리 카드"]];

/** 제작 가격 — 카드·챔피언을 만들 때 드는 프리즘과 분해할 때 받는 프리즘. 고치면 바로 저장돼요. */
export function AdminPrismManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [values, setValues] = useState<Values | null>(null);
  const [error, setError] = useState("");
  const saved = useRef<Values | null>(null);

  useEffect(() => {
    void adminFetch<{ settings: Setting[]; championPrismSetting: ChampionSetting }>("/prism", undefined, onUnauthorized)
      .then((body) => {
        const row = (r: Rarity) => body.settings.find((s) => s.rarity === r);
        const v: Values = {
          cards: Object.fromEntries(RARITIES.map(([r]) => [r, { craftCost: row(r)?.craftCost ?? null, disenchantReward: row(r)?.disenchantReward ?? null }])) as Values["cards"],
          champion: { craftCost: body.championPrismSetting.craftCost, duplicateReward: body.championPrismSetting.duplicateReward },
        };
        saved.current = v; setValues(v);
      })
      .catch((e) => setError(errorText(e, "설정을 불러오지 못했어요.")));
  }, []);

  const autosave = useAutosave("prism", values, async (next) => {
    const before = saved.current!;
    for (const [rarity, label] of RARITIES) {
      const a = next.cards[rarity], b = before.cards[rarity];
      if (a.craftCost === b.craftCost && a.disenchantReward === b.disenchantReward) continue;
      if (a.craftCost === null || a.disenchantReward === null) throw new Error(`${label}: 제작 비용과 분해 프리즘을 둘 다 넣어 주세요.`);
      await adminFetch(`/prism/settings/${rarity}`, { method: "PUT", json: a }, onUnauthorized);
    }
    const c = next.champion, d = before.champion;
    if (c.craftCost !== d.craftCost || c.duplicateReward !== d.duplicateReward) {
      if (c.craftCost === null || c.duplicateReward === null) throw new Error("챔피언: 제작 비용과 중복 보상을 둘 다 넣어 주세요.");
      await adminFetch("/prism/champion-settings", { method: "PUT", json: c }, onUnauthorized);
    }
    saved.current = next;
  });

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!values) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const setCard = (r: Rarity, patch: Partial<Values["cards"][Rarity]>) => setValues((v) => v && ({ ...v, cards: { ...v.cards, [r]: { ...v.cards[r], ...patch } } }));

  return (
    <div className="ak-page">
      <SaveLine state={autosave.state} />
      <Panel title="카드 만들기 · 분해" hint="게이머가 카드를 만들 때 쓰는 프리즘과, 카드를 분해할 때 받는 프리즘이에요. 값이 없는 등급은 게임에서 만들기·분해가 꺼져 있어요.">
        {RARITIES.map(([rarity, label]) => {
          const v = values.cards[rarity];
          return (
            <div key={rarity}>
              <p className="ak-hint" style={{ margin: "0 0 6px", color: "#ece9e2", fontWeight: 900 }}>{label}{v.craftCost === null ? " · 아직 꺼져 있어요" : ""}</p>
              <Grid>
                <Field label="만들 때 드는 프리즘"><NumberInput value={v.craftCost} step={5} onChange={(craftCost) => setCard(rarity, { craftCost, disenchantReward: v.disenchantReward ?? 0 })} /></Field>
                <Field label="분해하면 받는 프리즘"><NumberInput value={v.disenchantReward} step={5} onChange={(disenchantReward) => setCard(rarity, { disenchantReward, craftCost: v.craftCost ?? 0 })} /></Field>
              </Grid>
            </div>
          );
        })}
      </Panel>
      <Panel title="챔피언 만들기" hint="챔피언 프리즘은 카드 프리즘과 따로 모아요. 이미 가진 챔피언이 또 나오면 '중복 보상'만큼 챔피언 프리즘을 줘요.">
        <Grid>
          <Field label="만들 때 드는 챔피언 프리즘"><NumberInput value={values.champion.craftCost} step={5} onChange={(craftCost) => setValues((v) => v && ({ ...v, champion: { craftCost, duplicateReward: v.champion.duplicateReward ?? 0 } }))} /></Field>
          <Field label="중복 챔피언 보상"><NumberInput value={values.champion.duplicateReward} step={5} onChange={(duplicateReward) => setValues((v) => v && ({ ...v, champion: { duplicateReward, craftCost: v.champion.craftCost ?? 0 } }))} /></Field>
        </Grid>
      </Panel>
      <p className="ak-hint">프리즘을 유저에게 주거나 회수하는 건 ‘유저 · 자산 지급’ 화면에서 해요.</p>
    </div>
  );
}

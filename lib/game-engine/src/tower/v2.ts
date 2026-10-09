import { createDeterministicRandom } from "../../../../artifacts/ko-game/src/game/random/random";
import {
  TowerRuleError,
  eligibleRewardCard,
  weightedPick,
  synergyWeight,
} from "./domain";
import type { TowerCard, TowerCatalog, TowerRun } from "./types";
import type {
  TowerV2,
  TowerFloor,
  TowerBoss,
  RarityWeights,
  TowerDifficulty,
} from "./types-v2";
export const DEFAULT_RARITY_WEIGHTS: RarityWeights = {
  NORMAL: 70,
  EPIC: 25,
  LEGENDARY: 5,
};
export const ENEMY_DECK_WEIGHTS = {
  EASY: { rarity: 0.3, synergy: 0.1 },
  NORMAL: { rarity: 0.8, synergy: 0.5 },
  HARD: { rarity: 1.2, synergy: 1.0 },
};
export function towerFloor(
  catalog: TowerCatalog,
  number: number,
): TowerFloor | undefined {
  return catalog.season.v2?.floors.find((f) => f.number === number);
}
export function towerFloorCount(catalog: TowerCatalog): number {
  return catalog.season.v2?.floors.length ?? 16;
}
export function towerBoss(
  catalog: TowerCatalog,
  id: string,
): TowerBoss | undefined {
  return catalog.season.v2?.bosses.find((b) => b.id === id);
}
export function generateTowerEnemyDeck(
  catalog: TowerCatalog,
  championId: string,
  difficulty: TowerDifficulty,
  seed: string,
): string[] {
  const pool = catalog.cards
    .filter(eligibleRewardCard)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!pool.length)
    throw new TowerRuleError("EMPTY_POOL", "적 덱 생성 후보가 없습니다.");
  const random = createDeterministicRandom(seed),
    deck: string[] = [],
    weights = ENEMY_DECK_WEIGHTS[difficulty];
  for (let i = 0; i < 25; i++) {
    const desiredCost = [1, 2, 3, 4, 5, 6][i % 6]!,
      desiredType = i % 4 === 3 ? "TECHNIQUE" : "WRESTLER";
    const mock = { championId, deck } as TowerRun;
    const chosen = weightedPick(
      pool,
      (c) => {
        const copies = deck.filter((id) => id === c.id).length;
        const rarity =
          c.rarity === "LEGENDARY" ? 3 : c.rarity === "EPIC" ? 2 : 1;
        const curve = 1 / (1 + Math.abs(c.cost - desiredCost));
        const type = c.cardType === desiredType ? 2 : 0.65;
        const synergy =
          synergyWeight(c, mock, catalog) +
          (c.effectTags ?? []).filter((t) =>
            deck.some((id) =>
              catalog.cards.find((x) => x.id === id)?.effectTags?.includes(t),
            ),
          ).length;
        return (
          (curve *
            type *
            (1 + (rarity - 1) * weights.rarity) *
            (1 + synergy * weights.synergy)) /
          (1 + copies * copies * 2)
        );
      },
      random,
    );
    deck.push(chosen.id);
  }
  return deck;
}
export function v2CardRewardOptions(
  run: TowerRun,
  catalog: TowerCatalog,
): string[] {
  const pool = catalog.cards
      .filter(eligibleRewardCard)
      .sort((a, b) => a.id.localeCompare(b.id)),
    random = createDeterministicRandom(run.seed + ":cards:" + run.floor),
    chosen: TowerCard[] = [];
  const odds =
    towerFloor(catalog, run.floor)?.rarityWeights ??
    catalog.season.v2?.rarityWeights ??
    DEFAULT_RARITY_WEIGHTS;
  for (let i = 0; i < Math.min(3, pool.length); i++) {
    const remaining = pool.filter((c) => !chosen.some((x) => x.id === c.id)),
      rarities = Object.keys(odds).filter((r) =>
        remaining.some((c) => c.rarity === r),
      ) as (keyof RarityWeights)[];
    if (!rarities.length) break;
    const rarity = weightedPick(rarities, (r) => odds[r], random),
      candidates = remaining.filter((c) => c.rarity === rarity);
    chosen.push(
      weightedPick(
        candidates,
        (c) => {
          if (i < 2) return 1;
          const frequencies = run.deck.map((id) =>
            catalog.cards.find((x) => x.id === id),
          );
          const effectScore = (c.effectTags ?? []).filter((t) =>
            frequencies.some((x) => x?.effectTags?.includes(t)),
          ).length;
          const costCount = frequencies.filter(
            (x) => x?.cost === c.cost,
          ).length;
          return (
            synergyWeight(c, run, catalog) +
            effectScore * 2 +
            Math.max(0, 5 - costCount)
          );
        },
        random,
      ),
    );
  }
  if (chosen.length < 3)
    console.warn(
      "[tower] reward pool has fewer than three eligible distinct cards",
      run.id,
      run.floor,
    );
  return chosen.map((c) => c.id);
}
export function validateTowerV2(config: TowerV2, catalog: TowerCatalog): void {
  const fail = (message: string): never => {
    throw new TowerRuleError("INVALID_CONFIG", message);
  };
  if (!config.floors.length) fail("층을 추가해 주세요.");
  const ids = new Set<string>();
  for (const [i, f] of [...config.floors]
    .sort((a, b) => a.number - b.number)
    .entries()) {
    if (f.number !== i + 1 || ids.has(f.id))
      fail("층 번호는 1부터 연속이고 층 ID는 중복될 수 없습니다.");
    ids.add(f.id);
    if (f.type === "NORMAL" && !f.enemies.some((e) => e.weight > 0))
      fail(f.number + "층: 적 후보가 필요합니다.");
    if (f.type === "BOSS" && !config.bosses.some((b) => b.id === f.bossId))
      fail(f.number + "층: 보스를 선택해 주세요.");
  }
  if (
    config.floors.find((f) => f.number === config.floors.length)?.type !==
    "BOSS"
  )
    fail("마지막 층은 최종 보스여야 합니다.");
  if (new Set(config.bosses.map((b) => b.id)).size !== config.bosses.length)
    fail("보스 ID가 중복됩니다.");
  const allowed = new Set(
    catalog.cards.filter(eligibleRewardCard).map((c) => c.id),
  );
  for (const b of config.bosses)
    if (b.cardIds.length !== 25 || b.cardIds.some((id) => !allowed.has(id)))
      fail(b.name + ": 실제 사용 가능한 카드 25장이 필요합니다.");
  if (
    config.hiddenBossId &&
    !config.bosses.some((b) => b.id === config.hiddenBossId)
  )
    fail("히든 보스 설정을 확인해 주세요.");
}

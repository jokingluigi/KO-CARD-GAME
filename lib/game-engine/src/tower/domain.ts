import {
  towerFloor,
  towerFloorCount,
  towerBoss,
  generateTowerEnemyDeck,
  v2CardRewardOptions,
} from "./v2";
import { createDeterministicRandom } from "../../../../artifacts/ko-game/src/game/random/random";
import type {
  BossSlot,
  Condition,
  Encounter,
  History,
  RunCommand,
  TowerCard,
  TowerCatalog,
  TowerRun,
} from "./types";

export class TowerRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TowerRuleError";
  }
}
function requireRule(
  value: unknown,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new TowerRuleError(code, message);
}
export function eligibleRewardCard(card: TowerCard): boolean {
  return (
    ["PUBLISHED", "DRAFT"].includes(card.status) &&
    card.executable !== false &&
    Number.isInteger(card.cost) &&
    card.cost >= 0 &&
    card.cost <= 6 &&
    !card.isToken &&
    !card.isChampionToken &&
    card.rarity !== "CHAMPION" &&
    card.rarity !== "TOKEN" &&
    !card.excluded &&
    !/^(?:test-|admin-test-|internal-)/u.test(card.id)
  );
}
export function validateTowerDeck(
  deck: readonly string[],
  catalog: TowerCatalog,
): void {
  const allowed = new Set(
    catalog.cards.filter(eligibleRewardCard).map((card) => card.id),
  );
  requireRule(
    deck.length === 25 && deck.every((id) => allowed.has(id)),
    "INVALID_DECK",
    "타워 덱은 사용 가능한 카드 25장이어야 합니다.",
  );
}
export function conditionMatches(
  condition: Condition,
  run: TowerRun,
  catalog: TowerCatalog,
  history: History,
): boolean {
  switch (condition.type) {
    case "ALL":
      return (
        condition.conditions.length > 0 &&
        condition.conditions.every((child) =>
          conditionMatches(child, run, catalog, history),
        )
      );
    case "ANY":
      return condition.conditions.some((child) =>
        conditionMatches(child, run, catalog, history),
      );
    case "SEASON_PROTAGONIST":
      return run.championId === catalog.season.protagonistChampionId;
    case "CHAMPION":
      return run.championId === condition.id;
    case "RELIC":
      return run.relicIds.includes(condition.id);
    case "STARTER":
      return run.starterId === condition.id;
    case "NORMAL_ENDING":
      return history.normalEnding;
    case "CLEAR_COUNT":
      return history.clearCount >= condition.count;
    case "BOSS_CLEARED":
      return (
        run.defeatedBossSlots.includes(condition.id as BossSlot) ||
        history.bossSlots.includes(condition.id)
      );
    case "SYNERGY_COUNT":
      return (
        run.deck.filter((id) =>
          catalog.cards
            .find((card) => card.id === id)
            ?.synergyTags.includes(condition.tag),
        ).length >= condition.count
      );
    case "CARD":
      return run.deck.includes(condition.id);
    case "UNDEFEATED":
      return run.losses === 0;
  }
}
export function seedNumber(seed: string): number {
  return Math.floor(createDeterministicRandom(seed)() * 0x100000000) >>> 0;
}
export function weightedPick<T>(
  items: readonly T[],
  weight: (item: T) => number,
  random: () => number,
): T {
  requireRule(
    items.length > 0,
    "EMPTY_POOL",
    "사용 가능한 후보가 없습니다. 관리자 설정을 확인해 주세요.",
  );
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((sum, item) => sum + item, 0);
  if (total === 0)
    return items[
      Math.min(items.length - 1, Math.floor(random() * items.length))
    ]!;
  let needle = random() * total;
  for (let i = 0; i < items.length; i++) {
    needle -= weights[i]!;
    if (needle < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
const bossByFloor: Record<number, BossSlot> = {
  4: "boss1",
  8: "boss2",
  12: "boss3",
  16: "finalBoss",
};
export function encounterFor(
  run: TowerRun,
  catalog: TowerCatalog,
  hidden = false,
): Encounter {
  if (catalog.season.v2) {
    const floor = towerFloor(catalog, run.floor);
    requireRule(floor, "INVALID_FLOOR", "층 설정을 찾을 수 없습니다.");
    const bossId = hidden ? catalog.season.v2.hiddenBossId : floor.bossId;
    const seed = seedNumber(
      run.seed + ":battle:" + run.floor + ":" + (bossId ?? "normal"),
    );
    if (bossId) {
      const boss = towerBoss(catalog, bossId);
      requireRule(boss, "INVALID_BOSS", "보스 설정을 찾을 수 없습니다.");
      return {
        presetId: boss.id,
        bossSlot: (hidden ? "hiddenBoss" : boss.id) as BossSlot,
        enemyId: boss.id,
        championId: boss.championId,
        cardIds: [...boss.cardIds],
        difficulty: boss.difficulty,
        seed,
        sceneId: boss.sceneId ?? floor.sceneId,
        contentVersion: run.contentVersion,
        backgroundUrl:
          boss.backgroundUrl ??
          floor.backgroundUrl ??
          catalog.season.v2.backgroundUrl,
        music: boss.music ?? floor.music ?? catalog.season.music?.[hidden ? "hiddenBoss" : run.floor === towerFloorCount(catalog) ? "boss" : "midBoss"],
      };
    }
    const enemy = weightedPick(
      floor.enemies.filter((e) => e.weight > 0),
      (e) => e.weight,
      createDeterministicRandom(run.seed + ":encounter:" + run.floor),
    );
    return {
      presetId: enemy.id,
      enemyId: enemy.id,
      championId: enemy.championId,
      difficulty: enemy.difficulty,
      seed,
      cardIds: generateTowerEnemyDeck(
        catalog,
        enemy.championId,
        enemy.difficulty,
        run.seed + ":deck:" + run.floor,
      ),
      sceneId: floor.sceneId,
      contentVersion: run.contentVersion,
      backgroundUrl: floor.backgroundUrl ?? catalog.season.v2.backgroundUrl,
      music: floor.music ?? catalog.season.music?.normal,
    };
  }
  const bossSlot = hidden ? "hiddenBoss" : bossByFloor[run.floor];
  const random = createDeterministicRandom(
    `${run.seed}:encounter:${run.floor}:${hidden}`,
  );
  if (bossSlot) {
    const boss = catalog.season.bosses[bossSlot];
    const preset = catalog.presets.find(
      (item) => item.id === boss?.presetId && item.enabled,
    );
    requireRule(
      boss && preset,
      "INVALID_BOSS",
      "보스 덱 설정을 확인해 주세요.",
    );
    const sceneId =
      run.championId === catalog.season.protagonistChampionId
        ? (boss.protagonistSceneId ?? boss.commonSceneId)
        : boss.commonSceneId;
    return {
      presetId: preset.id,
      difficulty: preset.difficulty,
      seed: seedNumber(`${run.seed}:battle:${run.floor}:${bossSlot}`),
      bossSlot,
      sceneId,
    };
  }
  const act = Math.ceil(run.floor / 4);
  const pool = catalog.presets.filter(
    (item) =>
      item.enabled &&
      item.acts.includes(act) &&
      item.id !== run.previousNormalPresetId,
  );
  const preset = weightedPick(pool, (item) => item.weight, random);
  return {
    presetId: preset.id,
    difficulty: preset.difficulty,
    seed: seedNumber(`${run.seed}:battle:${run.floor}`),
  };
}
export function cardRewardOptions(
  run: TowerRun,
  catalog: TowerCatalog,
): string[] {
  if (catalog.season.v2) return v2CardRewardOptions(run, catalog);
  const pool = catalog.cards
    .filter(eligibleRewardCard)
    .sort((a, b) => a.id.localeCompare(b.id));
  requireRule(
    pool.length >= 3,
    "CARD_POOL_TOO_SMALL",
    "카드 보상에는 사용 가능한 카드가 최소 3종 필요합니다.",
  );
  const random = createDeterministicRandom(`${run.seed}:cards:${run.floor}`);
  const options: TowerCard[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const remaining = pool.filter(
      (card) => !options.some((option) => option.id === card.id),
    );
    options.push(
      weightedPick(
        remaining,
        (card) => (slot < 2 ? 1 : synergyWeight(card, run, catalog)),
        random,
      ),
    );
  }
  return options.map((card) => card.id);
}
export function synergyWeight(
  card: TowerCard,
  run: TowerRun,
  catalog: TowerCatalog,
): number {
  const frequencies = new Map<string, number>();
  for (const id of run.deck)
    for (const tag of catalog.cards.find((item) => item.id === id)
      ?.synergyTags ?? [])
      frequencies.set(tag, (frequencies.get(tag) ?? 0) + 1);
  const weights = catalog.season.synergyWeights;
  const preferred = catalog.preferredTags[run.championId] ?? [];
  return (
    1 +
    card.synergyTags.reduce(
      (sum, tag) => sum + (frequencies.get(tag) ?? 0) * weights.deckTag,
      0,
    ) +
    card.supportsTags.reduce(
      (sum, tag) => sum + (frequencies.get(tag) ?? 0) * weights.supportTag,
      0,
    ) +
    [...new Set([...card.synergyTags, ...card.supportsTags])].filter((tag) =>
      preferred.includes(tag),
    ).length *
      weights.championTag +
    (card.effectTags ?? []).filter((t) =>
      (catalog.championEffectTags?.[run.championId] ?? []).includes(t),
    ).length *
      weights.championTag
  );
}
function nextFloor(run: TowerRun, catalog: TowerCatalog): TowerRun {
  const next = {
    ...run,
    floor: run.floor + 1,
    phase: "HUB" as const,
    cardOptions: [],
    relicOptions: [],
    selectedCardId: undefined,
    dialogueIndex: 0,
  };
  return { ...next, encounter: encounterFor(next, catalog) };
}
function afterCardReward(
  run: TowerRun,
  catalog: TowerCatalog,
  history: History,
): TowerRun {
  if (!catalog.season.v2 || !towerFloor(catalog, run.floor)?.relicReward)
    return nextFloor(run, catalog);
  const candidates = catalog.relics.filter(
    (r) =>
      r.enabled &&
      !run.relicIds.includes(r.id) &&
      (r.initiallyUnlocked ||
        history.unlockedRelicIds.includes(r.id) ||
        (r.unlockCondition &&
          conditionMatches(r.unlockCondition, run, catalog, history))),
  );
  const random = createDeterministicRandom(run.seed + ":relics:" + run.floor);
  const options: string[] = [];
  while (options.length < Math.min(3, candidates.length))
    options.push(
      weightedPick(
        candidates.filter((c) => !options.includes(c.id)),
        () => 1,
        random,
      ).id,
    );
  return options.length
    ? {
        ...run,
        phase: "RELIC_REWARD",
        relicOptions: options,
        offeredRelicIds: [...run.offeredRelicIds, ...options],
      }
    : nextFloor(run, catalog);
}
export function newTowerRun(
  input: {
    id: string;
    seed: string;
    championId: string;
    starterId: string;
    ownedChampionIds: string[];
    isTest?: boolean;
  },
  catalog: TowerCatalog,
  history: History,
): TowerRun {
  requireRule(
    input.isTest || input.ownedChampionIds.includes(input.championId),
    "CHAMPION_NOT_OWNED",
    "보유한 챔피언만 선택할 수 있습니다.",
  );
  const starter = catalog.starters.find(
    (item) =>
      item.id === input.starterId &&
      (catalog.season.v2 || item.championId === input.championId) &&
      item.enabled,
  );
  requireRule(starter, "STARTER_MISSING", "사용 가능한 스타터 덱이 없습니다.");
  validateTowerDeck(starter.cardIds, catalog);
  const run: TowerRun = {
    schemaVersion: 1,
    id: input.id,
    seed: input.seed,
    version: 0,
    seasonId: catalog.season.id,
    championId: input.championId,
    starterId: starter.id,
    deck: [...starter.cardIds],
    relicIds: [],
    offeredRelicIds: [],
    floor: 1,
    phase: "HUB",
    encounter: { presetId: "", difficulty: "NORMAL", seed: 0 },
    cardOptions: [],
    relicOptions: [],
    dialogueIndex: 0,
    defeatedBossSlots: [],
    regularClear: false,
    hiddenClear: false,
    hiddenEvaluated: false,
    losses: 0,
    isTest: input.isTest === true,
    ended: false,
  };
  requireRule(
    starter.initiallyUnlocked ||
      history.unlockedStarterIds.includes(starter.id) ||
      (starter.unlockCondition &&
        conditionMatches(starter.unlockCondition, run, catalog, history)),
    "STARTER_LOCKED",
    "아직 잠긴 스타터 덱입니다.",
  );
  const initialized = {
    ...run,
    totalFloors: towerFloorCount(catalog),
    completedSceneIds: [],
  };
  const opening = catalog.season.v2?.openingSceneId;
  return {
    ...initialized,
    encounter: {
      ...encounterFor(initialized, catalog),
      ...(opening ? { sceneId: opening } : {}),
    },
    ...(opening
      ? { phase: "DIALOGUE" as const, dialogueReturn: "HUB" as const }
      : {}),
  };
}
export function transitionRun(
  previous: TowerRun,
  command: RunCommand,
  catalog: TowerCatalog,
  history: History,
  expectedVersion: number,
): TowerRun {
  requireRule(
    expectedVersion === previous.version,
    "STALE_RUN",
    "타워 진행 상태가 변경됐습니다. 다시 불러와 주세요.",
  );
  requireRule(!previous.ended, "RUN_ENDED", "종료된 타워 도전입니다.");
  let run = structuredClone(previous);
  if (command.type === "ABANDON")
    run = { ...run, phase: "RESULT", ended: true };
  else if (command.type === "CHALLENGE") {
    requireRule(
      run.phase === "HUB",
      "INVALID_PHASE",
      "현재는 전투를 시작할 수 없습니다.",
    );
    const scene = catalog.scenes.find(
      (item) => item.id === run.encounter.sceneId,
    );
    run.phase = scene?.lines.length ? "DIALOGUE" : "BATTLE";
  } else if (
    command.type === "DIALOGUE_NEXT" ||
    command.type === "DIALOGUE_SKIP"
  ) {
    requireRule(
      run.phase === "DIALOGUE",
      "INVALID_PHASE",
      "현재 대화가 진행 중이지 않습니다.",
    );
    const scene = catalog.scenes.find(
      (item) => item.id === run.encounter.sceneId,
    );
    run.dialogueIndex++;
    if (
      command.type === "DIALOGUE_SKIP" ||
      run.dialogueIndex >= (scene?.lines.length ?? 0)
    ) {
      run.completedSceneIds = [
        ...new Set([
          ...(run.completedSceneIds ?? []),
          ...(scene ? [scene.id] : []),
        ]),
      ];
      run.phase = run.dialogueReturn ?? "BATTLE";
      if (run.dialogueReturn === "HUB")
        run.encounter = encounterFor(run, catalog);
      if (run.dialogueReturn === "RESULT") run.ended = true;
      delete run.dialogueReturn;
    }
  } else if (command.type === "BATTLE_RESULT") {
    requireRule(
      run.phase === "BATTLE",
      "INVALID_PHASE",
      "진행 중인 전투가 없습니다.",
    );
    if (!command.won)
      run = { ...run, losses: run.losses + 1, phase: "RESULT", ended: true };
    else if (run.encounter.bossSlot) {
      const slot = run.encounter.bossSlot;
      run.defeatedBossSlots.push(slot);
      if (slot === "hiddenBoss")
        run = { ...run, hiddenClear: true, phase: "RESULT", ended: true };
      else if (
        slot === "finalBoss" ||
        (catalog.season.v2 && run.floor === towerFloorCount(catalog))
      ) {
        run.regularClear = true;
        run.hiddenEvaluated = true;
        if (
          (catalog.season.v2?.hiddenBossId ??
            catalog.season.bosses.hiddenBoss) &&
          (catalog.season.v2?.hiddenCondition ??
            catalog.season.hiddenCondition) &&
          conditionMatches(
            (catalog.season.v2?.hiddenCondition ??
              catalog.season.hiddenCondition)!,
            run,
            catalog,
            history,
          )
        )
          run = {
            ...run,
            encounter: encounterFor(run, catalog, true),
            phase: "HUB",
            dialogueIndex: 0,
          };
        else run = { ...run, phase: "RESULT", ended: true };
      } else if (
        (catalog.season.v2 && !towerFloor(catalog, run.floor)?.relicReward) ||
        (!catalog.season.v2 && run.isTest && run.relicIds.length === 3)
      ) {
        run = nextFloor(run, catalog);
      } else {
        const candidates = catalog.relics
          .filter(
            (item) =>
              item.enabled &&
              !(
                catalog.season.v2 ? run.relicIds : run.offeredRelicIds
              ).includes(item.id) &&
              (item.initiallyUnlocked ||
                history.unlockedRelicIds.includes(item.id) ||
                (item.unlockCondition &&
                  conditionMatches(
                    item.unlockCondition,
                    run,
                    catalog,
                    history,
                  ))),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        if (!catalog.season.v2)
          requireRule(
            candidates.length >= 3,
            "RELIC_POOL_TOO_SMALL",
            "유물 후보 3종을 구성할 수 없습니다. 관리자 설정을 확인해 주세요.",
          );
        const random = createDeterministicRandom(
          `${run.seed}:relics:${run.floor}`,
        );
        run.relicOptions = [];
        for (let i = 0; i < Math.min(3, candidates.length); i++)
          run.relicOptions.push(
            weightedPick(
              candidates.filter((item) => !run.relicOptions.includes(item.id)),
              () => 1,
              random,
            ).id,
          );
        run.offeredRelicIds.push(...run.relicOptions);
        run.phase = "RELIC_REWARD";
        if (!run.relicOptions.length) run = nextFloor(run, catalog);
      }
    } else {
      run.previousNormalPresetId = run.encounter.presetId;
      run.cardOptions = cardRewardOptions(run, catalog);
      run.phase = "CARD_REWARD";
    }
  } else if (command.type === "SKIP_CARD") {
    requireRule(
      run.phase === "CARD_REWARD" || run.phase === "REPLACE",
      "INVALID_PHASE",
      "카드 보상을 선택 중이지 않습니다.",
    );
    run = afterCardReward(run, catalog, history);
  } else if (command.type === "SELECT_CARD") {
    requireRule(
      (run.phase === "CARD_REWARD" || run.phase === "REPLACE") &&
        run.cardOptions.includes(command.cardId),
      "INVALID_CARD_OPTION",
      "보상 후보에서 카드를 선택해 주세요.",
    );
    run = { ...run, selectedCardId: command.cardId, phase: "REPLACE" };
  } else if (command.type === "CANCEL_CARD_SELECTION") {
    requireRule(
      run.phase === "REPLACE",
      "INVALID_PHASE",
      "교체 중이 아닙니다.",
    );
    run = { ...run, phase: "CARD_REWARD", selectedCardId: undefined };
  } else if (command.type === "REPLACE_CARD") {
    requireRule(
      run.phase === "REPLACE" &&
        run.selectedCardId &&
        Number.isInteger(command.deckIndex) &&
        command.deckIndex >= 0 &&
        command.deckIndex < 25,
      "INVALID_REPLACEMENT",
      "교체할 카드 한 장을 선택해 주세요.",
    );
    run.deck[command.deckIndex] = run.selectedCardId;
    validateTowerDeck(run.deck, catalog);
    run = afterCardReward(run, catalog, history);
  } else if (command.type === "SELECT_RELIC") {
    requireRule(
      run.phase === "RELIC_REWARD" &&
        run.relicOptions.includes(command.relicId) &&
        (catalog.season.v2 || run.relicIds.length < 3) &&
        !run.relicIds.includes(command.relicId),
      "INVALID_RELIC_OPTION",
      "유물 후보에서 선택해 주세요.",
    );
    run.relicIds.push(command.relicId);
    run = nextFloor(run, catalog);
  } else
    throw new TowerRuleError(
      "INVALID_COMMAND",
      "지원되지 않는 타워 명령입니다.",
    );
  if (
    catalog.season.v2 &&
    run.ended &&
    (run.regularClear || run.hiddenClear) &&
    command.type === "BATTLE_RESULT" &&
    command.won
  ) {
    const ending = run.hiddenClear
      ? catalog.season.v2.hiddenEndingSceneId
      : catalog.season.v2.endingSceneId;
    if (
      ending &&
      catalog.scenes.some((s) => s.id === ending && s.lines.length) &&
      !run.completedSceneIds?.includes(ending)
    )
      run = {
        ...run,
        phase: "DIALOGUE",
        ended: false,
        dialogueReturn: "RESULT",
        dialogueIndex: 0,
        encounter: { ...run.encounter, sceneId: ending },
      };
  }
  return { ...run, version: previous.version + 1 };
}

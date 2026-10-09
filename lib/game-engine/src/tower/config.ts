import {
  TOWER_EFFECT_LIBRARY,
  towerEffectTargetZones,
  TOWER_EFFECT_EVENTS,
  describeTowerEffect,
  type TowerConfiguredEffect,
  type TowerEffectCondition,
} from "./effects";
import {
  isEffectScript,
  ACTION_SCHEMAS,
  type Action,
} from "@workspace/effect-registry";
import { TOWER_RELIC_DEFINITIONS } from "./relic-definitions";
import { TowerRuleError } from "./domain";
import {
  EXPRESSIONS,
  RELIC_TYPES,
  type AccountReward,
  type BossConfig,
  type Condition,
  type Preset,
  type Relic,
  type RunCommand,
  type Scene,
  type Season,
  type Starter,
  type StoryCharacter,
} from "./types";

// Battle results are exclusively derived by the server from the shared engine.
export function parseRunCommand(
  value: unknown,
): Exclude<RunCommand, { type: "BATTLE_RESULT" }> {
  const c = object(value);
  const keys = Object.keys(c);
  const fields =
    c.type === "SELECT_CARD"
      ? ["type", "cardId"]
      : c.type === "SELECT_RELIC"
        ? ["type", "relicId"]
        : c.type === "REPLACE_CARD"
          ? ["type", "deckIndex"]
          : ["type"];
  if (keys.some((key) => !fields.includes(key)))
    throw new TowerRuleError(
      "INVALID_COMMAND",
      "지원되지 않는 명령 필드입니다.",
    );
  switch (c.type) {
    case "CANCEL_CARD_SELECTION":
    case "CHALLENGE":
    case "DIALOGUE_NEXT":
    case "DIALOGUE_SKIP":
    case "SKIP_CARD":
    case "ABANDON":
      return { type: c.type };
    case "SELECT_CARD":
      return { type: c.type, cardId: text(c.cardId) };
    case "SELECT_RELIC":
      return { type: c.type, relicId: text(c.relicId) };
    case "REPLACE_CARD": {
      const deckIndex = number(c.deckIndex, 0, 24);
      if (!Number.isInteger(deckIndex))
        throw new TowerRuleError(
          "INVALID_COMMAND",
          "교체 위치는 정수여야 합니다.",
        );
      return { type: c.type, deckIndex };
    }
    default:
      throw new TowerRuleError(
        "INVALID_COMMAND",
        "지원되지 않는 타워 명령입니다.",
      );
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TowerRuleError("INVALID_CONFIG", "설정은 객체여야 합니다.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new TowerRuleError(
      "INVALID_CONFIG",
      "필수 문자열 또는 길이를 확인해 주세요.",
    );
  return value.trim();
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new TowerRuleError("INVALID_CONFIG", "숫자 범위를 확인해 주세요.");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new TowerRuleError("INVALID_CONFIG", "사용 여부를 지정해 주세요.");
  return value;
}
function strings(value: unknown, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new TowerRuleError("INVALID_CONFIG", "목록 크기를 확인해 주세요.");
  return value.map((item) => text(item));
}
function deck(value: unknown): string[] {
  const cards = strings(value, 25);
  if (cards.length !== 25)
    throw new TowerRuleError("INVALID_DECK", "정확히 25장이 필요합니다.");
  return cards;
}
function difficulty(value: unknown): Preset["difficulty"] {
  if (
    value !== "EASY" &&
    value !== "NORMAL" &&
    value !== "HARD" &&
    value !== "BOSS"
  )
    throw new TowerRuleError("INVALID_CONFIG", "AI 난이도를 확인해 주세요.");
  return value;
}
export function parseCondition(
  value: unknown,
  depth = 0,
  budget = { left: 50 },
): Condition {
  if (depth > 8 || --budget.left < 0)
    throw new TowerRuleError("INVALID_CONDITION", "조건이 너무 복잡합니다.");
  const c = object(value);
  if (c.type === "ALL" || c.type === "ANY") {
    if (
      !Array.isArray(c.conditions) ||
      !c.conditions.length ||
      c.conditions.length > 20
    )
      throw new TowerRuleError(
        "INVALID_CONDITION",
        "조건 그룹에 조건을 추가해 주세요.",
      );
    return {
      type: c.type,
      conditions: c.conditions.map((child) =>
        parseCondition(child, depth + 1, budget),
      ),
    };
  }
  if (
    c.type === "SEASON_PROTAGONIST" ||
    c.type === "UNDEFEATED" ||
    c.type === "NORMAL_ENDING"
  )
    return { type: c.type };
  if (
    c.type === "CHAMPION" ||
    c.type === "RELIC" ||
    c.type === "STARTER" ||
    c.type === "BOSS_CLEARED" ||
    c.type === "CARD"
  )
    return { type: c.type, id: text(c.id) };
  if (c.type === "CLEAR_COUNT")
    return { type: c.type, count: Math.ceil(number(c.count, 0, 100000)) };
  if (c.type === "SYNERGY_COUNT")
    return {
      type: c.type,
      tag: text(c.tag),
      count: Math.ceil(number(c.count, 1, 25)),
    };
  throw new TowerRuleError("INVALID_CONDITION", "지원되지 않는 조건입니다.");
}
export function parseReward(value: unknown): AccountReward {
  const r = object(value);
  if (
    r.type !== "CHAMPION" &&
    r.type !== "CARD" &&
    r.type !== "PACK" &&
    r.type !== "CURRENCY"
  )
    throw new TowerRuleError("INVALID_REWARD", "보상 종류를 확인해 주세요.");
  const amount = number(r.amount, 1, 100000);
  if (!Number.isInteger(amount))
    throw new TowerRuleError("INVALID_REWARD", "보상 수량은 정수여야 합니다.");
  return {
    type: r.type,
    amount,
    ...(r.type === "CURRENCY" ? {} : { targetId: text(r.targetId) }),
  };
}
function boss(value: unknown): BossConfig {
  const b = object(value);
  return {
    presetId: text(b.presetId),
    firstReward: parseReward(b.firstReward),
    repeatReward: parseReward(b.repeatReward),
    ...(b.commonSceneId ? { commonSceneId: text(b.commonSceneId) } : {}),
    ...(b.protagonistSceneId
      ? { protagonistSceneId: text(b.protagonistSceneId) }
      : {}),
  };
}
function musicTrack(value: unknown) {
  const track = object(value);
  const assetUrl = text(track.assetUrl, 2000);
  let valid = false;
  try {
    valid = ["http:", "https:"].includes(
      new URL(assetUrl, "https://tower.invalid").protocol,
    );
  } catch {}
  if (!valid)
    throw new TowerRuleError("INVALID_CONFIG", "OST 주소를 확인해 주세요.");
  return {
    name: text(track.name),
    assetUrl,
    volume: number(track.volume, 0, 100),
  };
}
export function parseSeason(value: unknown): Season {
  const s = object(value);
  const b = s.v2 ? {} : object(s.bosses);
  const weights = object(s.synergyWeights);
  return {
    id: text(s.id),
    name: text(s.name),
    description:
      typeof s.description === "string" ? s.description.slice(0, 2000) : "",
    protagonistChampionId: s.v2 ? "" : text(s.protagonistChampionId),
    ...(s.v2 ? { v2: parseTowerV2(s.v2) } : {}),
    ...(s.music
      ? {
          music: Object.fromEntries(
            ["normal", "midBoss", "boss", "hiddenBoss"]
              .filter((key) => object(s.music)[key] !== undefined)
              .map((key) => [key, musicTrack(object(s.music)[key])]),
          ),
        }
      : {}),
    bosses: s.v2
      ? ({} as Season["bosses"])
      : {
          boss1: boss(b.boss1),
          boss2: boss(b.boss2),
          boss3: boss(b.boss3),
          finalBoss: boss(b.finalBoss),
          ...(b.hiddenBoss ? { hiddenBoss: boss(b.hiddenBoss) } : {}),
        },
    ...(s.hiddenCondition
      ? { hiddenCondition: parseCondition(s.hiddenCondition) }
      : {}),
    synergyWeights: {
      deckTag: number(weights.deckTag, 0, 100),
      supportTag: number(weights.supportTag, 0, 100),
      championTag: number(weights.championTag, 0, 100),
    },
  };
}
export function parsePreset(value: unknown): Preset {
  const p = object(value);
  if (
    !Array.isArray(p.acts) ||
    p.acts.some((act) => !Number.isInteger(act) || act < 1 || act > 4)
  )
    throw new TowerRuleError("INVALID_CONFIG", "ACT는 1~4입니다.");
  return {
    id: text(p.id),
    name: text(p.name),
    championId: text(p.championId),
    cardIds: deck(p.cardIds),
    acts: [...new Set(p.acts as number[])],
    difficulty: difficulty(p.difficulty),
    enabled: bool(p.enabled),
    weight: number(p.weight, 0, 10000),
  };
}
export function parseStarter(value: unknown): Starter {
  const s = object(value);
  return {
    id: text(s.id),
    name: text(s.name),
    championId: text(s.championId),
    ...(s.description ? { description: text(s.description, 2000) } : {}),
    ...(s.imageUrl ? { imageUrl: safeImage(s.imageUrl) } : {}),
    ...(s.difficultyLabel
      ? { difficultyLabel: text(s.difficultyLabel, 200) }
      : {}),
    cardIds: deck(s.cardIds),
    enabled: bool(s.enabled),
    isDefault: bool(s.isDefault),
    initiallyUnlocked: bool(s.initiallyUnlocked),
    ...(s.unlockCondition
      ? { unlockCondition: parseCondition(s.unlockCondition) }
      : {}),
  };
}
export function parseRelic(value: unknown): Relic {
  const r = object(value);
  if (r.effects) {
    const effects = parseTowerConfiguredEffects(r.effects);
    if (!effects.length)
      throw new TowerRuleError("INVALID_RELIC", "유물 효과를 추가해 주세요.");
    return {
      id: text(r.id),
      name: text(r.name),
      effectType: "CONFIGURED",
      values: {},
      description: effects.map(describeTowerEffect).join("\n"),
      effects,
      enabled: bool(r.enabled),
      initiallyUnlocked: bool(r.initiallyUnlocked),
      ...(r.imageUrl ? { imageUrl: safeImage(r.imageUrl) } : {}),
      ...(r.unlockCondition
        ? { unlockCondition: parseCondition(r.unlockCondition) }
        : {}),
    };
  }
  if (!RELIC_TYPES.includes(r.effectType as any))
    throw new TowerRuleError(
      "INVALID_RELIC",
      "유물 효과 종류를 확인해 주세요.",
    );
  const values = object(r.values);
  const definition = TOWER_RELIC_DEFINITIONS.find(
    (definition) => definition.type === r.effectType,
  )!;
  const allowedKeys = Object.keys(definition.values);
  const normalized: Record<string, number> = { ...definition.values };
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.includes(key))
      throw new TowerRuleError(
        "INVALID_RELIC",
        "지원되지 않는 유물 수치입니다.",
      );
    normalized[key] = number(value, 0, 25);
    if (!Number.isInteger(normalized[key]))
      throw new TowerRuleError("INVALID_RELIC", "유물 수치는 정수여야 합니다.");
  }
  const effects = r.effects
    ? parseTowerConfiguredEffects(r.effects)
    : undefined;
  return {
    ...(effects ? { effects } : {}),
    id: text(r.id),
    name: text(r.name),
    description: effects?.length
      ? effects.map(describeTowerEffect).join("\n")
      : text(r.description, 2000),
    effectType: r.effectType as Relic["effectType"],
    values: normalized,
    enabled: bool(r.enabled),
    initiallyUnlocked: bool(r.initiallyUnlocked),
    ...(r.imageUrl ? { imageUrl: safeImage(r.imageUrl) } : {}),
    ...(r.unlockCondition
      ? { unlockCondition: parseCondition(r.unlockCondition) }
      : {}),
  };
}
function safeAudio(value: unknown): string {
  const url = text(value, 2000);
  if (
    !url.startsWith("/api/storage/objects/") &&
    !/^https:\/\/[^\s]+$/.test(url)
  )
    throw new TowerRuleError(
      "INVALID_CONFIG",
      "효과음 저장소 또는 HTTPS 주소를 사용하세요.",
    );
  return url;
}
function safeImage(value: unknown): string {
  const url = text(value, 2000);
  if (!url.startsWith("/api/storage/objects/"))
    throw new TowerRuleError(
      "INVALID_IMAGE",
      "기존 저장소에 업로드한 이미지를 사용해 주세요.",
    );
  return url;
}
export function parseCharacter(value: unknown): StoryCharacter {
  const c = object(value);
  const sprites = object(c.sprites);
  const result: StoryCharacter["sprites"] = {};
  for (const key of EXPRESSIONS)
    if (sprites[key]) result[key] = safeImage(sprites[key]);
  return {
    id: text(c.id),
    displayName: text(c.displayName),
    ...(c.championId ? { championId: text(c.championId) } : {}),
    sprites: result,
  };
}
export function parseScene(value: unknown): Scene {
  const s = object(value);
  if (!Array.isArray(s.lines) || s.lines.length > 200)
    throw new TowerRuleError("INVALID_SCENE", "대사는 최대 200줄입니다.");
  return {
    id: text(s.id),
    name: text(s.name),
    ...(s.music ? { music: musicTrack(s.music) } : {}),
    lines: s.lines.map((value, order) => {
      const l = object(value);
      if (
        !EXPRESSIONS.includes(l.expression as (typeof EXPRESSIONS)[number]) ||
        (l.side !== "LEFT" && l.side !== "RIGHT")
      )
        throw new TowerRuleError(
          "INVALID_SCENE",
          "표정과 위치를 확인해 주세요.",
        );
      const placement: Record<string, number> = {};
      for (const [key, min, max] of [
        ["spriteScale", 0.5, 1.5],
        ["spriteOffsetX", -30, 30],
        ["spriteOffsetY", -30, 30],
      ] as const) {
        if (l[key] !== undefined) {
          if (
            typeof l[key] !== "number" ||
            !Number.isFinite(l[key]) ||
            l[key] < min ||
            l[key] > max
          )
            throw new TowerRuleError(
              "INVALID_SCENE",
              "인물 크기와 위치 범위를 확인해 주세요.",
            );
          placement[key] = l[key];
        }
      }
      return {
        ...(l.backgroundUrl
          ? { backgroundUrl: safeImage(l.backgroundUrl) }
          : {}),
        ...(l.music ? { music: musicTrack(l.music) } : {}),
        ...(l.sfxUrl ? { sfxUrl: safeAudio(l.sfxUrl) } : {}),
        ...(l.shake !== undefined ? { shake: number(l.shake, 0, 12) } : {}),
        ...(l.fade !== undefined ? { fade: bool(l.fade) } : {}),
        ...(l.blackout !== undefined ? { blackout: bool(l.blackout) } : {}),
        ...(l.actorVisibility === "SHOW" || l.actorVisibility === "HIDE"
          ? { actorVisibility: l.actorVisibility }
          : {}),
        speakerId: text(l.speakerId),
        expression: l.expression as (typeof EXPRESSIONS)[number],
        side: l.side as "LEFT" | "RIGHT",
        text: text(l.text, 2000),
        order,
        ...placement,
      };
    }),
  };
}
export function parseMetadata(value: unknown): {
  synergyTags: string[];
  supportsTags: string[];
  preferredSynergyTags: string[];
  excluded: boolean;
} {
  const m = object(value);
  return {
    synergyTags: [...new Set(strings(m.synergyTags ?? [], 20))],
    supportsTags: [...new Set(strings(m.supportsTags ?? [], 20))],
    preferredSynergyTags: [
      ...new Set(strings(m.preferredSynergyTags ?? [], 20)),
    ],
    excluded: m.excluded === true,
  };
}

export function parseRarityWeights(
  value: unknown,
): import("./types-v2").RarityWeights {
  const v = object(value);
  const result = {
    NORMAL: number(v.NORMAL, 0, 100),
    EPIC: number(v.EPIC, 0, 100),
    LEGENDARY: number(v.LEGENDARY, 0, 100),
  };
  if (Math.abs(result.NORMAL + result.EPIC + result.LEGENDARY - 100) > 0.00001)
    throw new TowerRuleError(
      "INVALID_CONFIG",
      "희귀도 확률 합계는 100%여야 합니다.",
    );
  return result;
}
export function parseTowerV2(value: unknown): import("./types-v2").TowerV2 {
  const v = object(value);
  const difficultyV2 = (x: unknown) => {
    if (!["EASY", "NORMAL", "HARD"].includes(String(x)))
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "쉬움·보통·어려움 중 선택하세요.",
      );
    return x as import("./types-v2").TowerDifficulty;
  };
  const optional = (o: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(
      keys.filter((k) => o[k]).map((k) => [k, text(o[k], 2000)]),
    );
  if (!Array.isArray(v.floors) || !Array.isArray(v.bosses))
    throw new TowerRuleError("INVALID_CONFIG", "층과 보스 목록이 필요합니다.");
  const floors = v.floors.map((x) => {
    const f = object(x);
    if (
      !["NORMAL", "BOSS"].includes(String(f.type)) ||
      !Array.isArray(f.enemies)
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "층 종류와 적 후보를 확인하세요.",
      );
    const n = number(f.number, 1, 999);
    if (!Number.isInteger(n))
      throw new TowerRuleError("INVALID_CONFIG", "층 번호는 정수여야 합니다.");
    return {
      id: text(f.id),
      number: n,
      type: f.type as "NORMAL" | "BOSS",
      relicReward: bool(f.relicReward),
      enemies: f.enemies.map((x) => {
        const e = object(x);
        return {
          id: text(e.id),
          name: text(e.name),
          championId: text(e.championId),
          difficulty: difficultyV2(e.difficulty),
          weight: number(e.weight, 0, 10000),
        };
      }),
      ...optional(f, ["bossId", "sceneId", "backgroundUrl"]),
      ...(f.music ? { music: musicTrack(f.music) } : {}),
      ...(f.rarityWeights
        ? { rarityWeights: parseRarityWeights(f.rarityWeights) }
        : {}),
    };
  });
  const bosses = v.bosses.map((x) => {
    const b = object(x);
    const maxHealth = number(b.maxHealth, 1, 100000),
      startingHealth = number(b.startingHealth, 1, maxHealth);
    if (!Number.isInteger(maxHealth) || !Number.isInteger(startingHealth))
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "보스 체력은 정수여야 합니다.",
      );
    if (!Array.isArray(b.firstRewards) || !Array.isArray(b.repeatRewards))
      throw new TowerRuleError("INVALID_REWARD", "보상 배열을 확인하세요.");
    return {
      id: text(b.id),
      name: text(b.name),
      championId: text(b.championId),
      cardIds: strings(b.cardIds, 25),
      difficulty: difficultyV2(b.difficulty),
      startingHealth,
      maxHealth,
      firstRewards: b.firstRewards.map(parseReward),
      repeatRewards: b.repeatRewards.map(parseReward),
      ...(b.abilities
        ? { abilities: parseTowerConfiguredEffects(b.abilities) }
        : {}),
      ...optional(b, ["sceneId", "backgroundUrl"]),
      ...(b.music ? { music: musicTrack(b.music) } : {}),
    };
  });
  return {
    schemaVersion: 2,
    enabled: bool(v.enabled),
    visible: bool(v.visible),
    sortOrder: number(v.sortOrder ?? 0, -100000, 100000),
    recommendedDifficulty:
      typeof v.recommendedDifficulty === "string"
        ? v.recommendedDifficulty.slice(0, 100)
        : "",
    floors,
    bosses,
    rarityWeights: parseRarityWeights(v.rarityWeights),
    ...optional(v, [
      "imageUrl",
      "backgroundUrl",
      "selectionImageUrl",
      "openingSceneId",
      "endingSceneId",
      "hiddenEndingSceneId",
      "hiddenBossId",
    ]),
    ...(v.hiddenCondition
      ? { hiddenCondition: parseCondition(v.hiddenCondition) }
      : {}),
  };
}

function parseTowerEffectCondition(
  value: unknown,
  depth = 0,
): TowerEffectCondition {
  if (depth > 8)
    throw new TowerRuleError("INVALID_CONFIG", "조건 그룹 깊이를 줄여 주세요.");
  const c = object(value);
  if (c.type === "ALL" || c.type === "ANY") {
    if (!Array.isArray(c.conditions) || !c.conditions.length)
      throw new TowerRuleError("INVALID_CONFIG", "조건 그룹을 채워 주세요.");
    return {
      type: c.type,
      conditions: c.conditions.map((x) =>
        parseTowerEffectCondition(x, depth + 1),
      ),
    };
  }
  if (c.type === "CARD_TAG" || c.type === "CARD_KEYWORD" || c.type === "RELIC")
    return { type: c.type, id: text(c.id) };
  if (
    c.type === "NUMBER" &&
    c.field === "EVENT_COUNT" &&
    !TOWER_EFFECT_EVENTS.includes(c.event as any)
  )
    throw new TowerRuleError(
      "INVALID_CONFIG",
      "행동 기록 이벤트를 선택하세요.",
    );
  if (
    c.type === "NUMBER" &&
    [
      "TURN",
      "CHAMPION_HP",
      "GOLD",
      "FIELD_COUNT",
      "CARD_ATK",
      "CARD_HP",
      "CARD_COST",
      "EVENT_COUNT",
    ].includes(String(c.field)) &&
    ["EQ", "GTE", "LTE"].includes(String(c.compare))
  )
    return {
      type: "NUMBER",
      field: c.field as any,
      compare: c.compare as any,
      value: number(c.value, -999, 100000),
      ...(c.event ? { event: text(c.event) as any } : {}),
    };
  throw new TowerRuleError("INVALID_CONFIG", "지원되는 조건을 선택해 주세요.");
}
export function parseTowerConfiguredEffects(
  value: unknown,
): TowerConfiguredEffect[] {
  if (!Array.isArray(value))
    throw new TowerRuleError("INVALID_CONFIG", "효과 목록을 확인하세요.");
  const ids = new Set<string>();
  return value.map((x) => {
    const e = object(x),
      id = text(e.id);
    if (ids.has(id))
      throw new TowerRuleError("INVALID_CONFIG", "효과 ID가 중복됩니다.");
    ids.add(id);
    if (
      !TOWER_EFFECT_EVENTS.includes(e.event as any) ||
      !["SELF", "ENEMY", "ANY"].includes(String(e.eventOwner)) ||
      !TOWER_EFFECT_LIBRARY.some((d) => d.effect_type === e.action)
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "실행 가능한 이벤트와 효과만 사용할 수 있습니다.",
      );
    if (e.action === "FUSION" && object(e.values ?? {}).fusionIntoSource)
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "자동 합체는 이벤트의 선수에서 지정 아군으로 실행하세요.",
      );
    const values = object(e.values ?? {}),
      limit = object(e.limit);
    if (!["UNLIMITED", "TURN", "BATTLE", "RUN"].includes(String(limit.scope)))
      throw new TowerRuleError("INVALID_CONFIG", "발동 제한을 확인하세요.");
    const count = number(limit.count, 1, 100000);
    if (!Number.isInteger(count))
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "발동 제한은 정수여야 합니다.",
      );
    if (!["BATTLE", "RUN"].includes(String(e.duration)))
      throw new TowerRuleError("INVALID_CONFIG", "지속시간을 선택하세요.");
    if (
      e.duration === "RUN" &&
      ![
        "BUFF",
        "MODIFY_STAT",
        "MODIFY_MAX_HEALTH",
        "REDUCE_COST",
        "INCREASE_COST",
        "SET_STAT",
        "SET_STATS",
      ].includes(String(e.action))
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "런 지속은 카드의 능력치·비용 변경 효과에 사용하세요.",
      );
    const target = e.target ? object(e.target) : undefined;
    if (
      target &&
      (!["ALL", "SELF", "TOP", "RANDOM"].includes(String(target.selection)) ||
        !["SELF", "ENEMY", "ALL"].includes(String(target.owner)))
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "자동 실행 가능한 대상만 선택하세요.",
      );
    if (
      e.duration === "RUN" &&
      (!target ||
        target.owner !== "SELF" ||
        !["BOARD", "HAND", "DECK"].includes(String(target.zone)))
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "런 지속 대상은 내 덱의 카드여야 합니다.",
      );
    if (
      target &&
      ACTION_SCHEMAS[e.action as Action]?.target &&
      (!(
        target.zone &&
        towerEffectTargetZones(String(e.action)).includes(String(target.zone))
      ) ||
        target.zones ||
        (target.zone === "PLAYER" && target.owner === "ALL"))
    )
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "이 효과가 지원하는 대상 존을 선택하세요.",
      );
    const script = {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [{ type: "EFFECT", effect: { action: e.action, target, values } }],
    };
    if (!isEffectScript(script))
      throw new TowerRuleError(
        "INVALID_CONFIG",
        "효과의 대상·수치 정의를 확인하세요.",
      );
    return {
      id,
      name: text(e.name),
      enabled: bool(e.enabled),
      event: e.event as any,
      eventOwner: e.eventOwner as any,
      action: e.action as any,
      target: target as any,
      values,
      priority: number(e.priority, -100000, 100000),
      duration: e.duration as any,
      limit: { scope: limit.scope as any, count },
      ...(e.condition
        ? { condition: parseTowerEffectCondition(e.condition) }
        : {}),
      ...(e.iconUrl ? { iconUrl: text(e.iconUrl, 2000) } : {}),
    };
  });
}

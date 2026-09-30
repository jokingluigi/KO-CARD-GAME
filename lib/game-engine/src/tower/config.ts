import { TowerRuleError } from './domain';
import { EXPRESSIONS, RELIC_TYPES, type AccountReward, type BossConfig, type Condition, type Preset, type Relic, type RunCommand, type Scene, type Season, type Starter, type StoryCharacter } from './types';

// Battle results are exclusively derived by the server from the shared engine.
export function parseRunCommand(value: unknown): Exclude<RunCommand, { type: 'BATTLE_RESULT' }> {
  const c = object(value);
  const keys = Object.keys(c);
  const fields = c.type === 'SELECT_CARD' ? ['type', 'cardId'] : c.type === 'SELECT_RELIC' ? ['type', 'relicId'] : c.type === 'REPLACE_CARD' ? ['type', 'deckIndex'] : ['type'];
  if (keys.some(key => !fields.includes(key))) throw new TowerRuleError('INVALID_COMMAND', '지원되지 않는 명령 필드입니다.');
  switch (c.type) {
    case 'CHALLENGE': case 'DIALOGUE_NEXT': case 'DIALOGUE_SKIP': case 'SKIP_CARD': case 'ABANDON': return { type: c.type };
    case 'SELECT_CARD': return { type: c.type, cardId: text(c.cardId) };
    case 'SELECT_RELIC': return { type: c.type, relicId: text(c.relicId) };
    case 'REPLACE_CARD': {
      const deckIndex = number(c.deckIndex, 0, 24);
      if (!Number.isInteger(deckIndex)) throw new TowerRuleError('INVALID_COMMAND', '교체 위치는 정수여야 합니다.');
      return { type: c.type, deckIndex };
    }
    default: throw new TowerRuleError('INVALID_COMMAND', '지원되지 않는 타워 명령입니다.');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TowerRuleError('INVALID_CONFIG', '설정은 객체여야 합니다.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TowerRuleError('INVALID_CONFIG', '필수 문자열 또는 길이를 확인해 주세요.');
  return value.trim();
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new TowerRuleError('INVALID_CONFIG', '숫자 범위를 확인해 주세요.');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TowerRuleError('INVALID_CONFIG', '사용 여부를 지정해 주세요.'); return value;
}
function strings(value: unknown, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max) throw new TowerRuleError('INVALID_CONFIG', '목록 크기를 확인해 주세요.');
  return value.map(item => text(item));
}
function deck(value: unknown): string[] { const cards = strings(value, 25); if (cards.length !== 25) throw new TowerRuleError('INVALID_DECK', '정확히 25장이 필요합니다.'); return cards; }
function difficulty(value: unknown): Preset['difficulty'] { if (value !== 'NORMAL' && value !== 'HARD' && value !== 'BOSS') throw new TowerRuleError('INVALID_CONFIG', 'AI 난이도를 확인해 주세요.'); return value; }
export function parseCondition(value: unknown, depth = 0, budget = { left: 50 }): Condition {
  if (depth > 8 || --budget.left < 0) throw new TowerRuleError('INVALID_CONDITION', '조건이 너무 복잡합니다.');
  const c = object(value);
  if (c.type === 'ALL' || c.type === 'ANY') {
    if (!Array.isArray(c.conditions) || !c.conditions.length || c.conditions.length > 20) throw new TowerRuleError('INVALID_CONDITION', '조건 그룹에 조건을 추가해 주세요.');
    return { type: c.type, conditions: c.conditions.map(child => parseCondition(child, depth + 1, budget)) };
  }
  if (c.type === 'SEASON_PROTAGONIST' || c.type === 'UNDEFEATED' || c.type === 'NORMAL_ENDING') return { type: c.type };
  if (c.type === 'CHAMPION' || c.type === 'RELIC' || c.type === 'STARTER' || c.type === 'BOSS_CLEARED' || c.type === 'CARD') return { type: c.type, id: text(c.id) };
  if (c.type === 'CLEAR_COUNT') return { type: c.type, count: Math.ceil(number(c.count, 0, 100000)) };
  if (c.type === 'SYNERGY_COUNT') return { type: c.type, tag: text(c.tag), count: Math.ceil(number(c.count, 1, 25)) };
  throw new TowerRuleError('INVALID_CONDITION', '지원되지 않는 조건입니다.');
}
export function parseReward(value: unknown): AccountReward {
  const r = object(value);
  if (r.type !== 'CARD' && r.type !== 'PACK' && r.type !== 'CURRENCY') throw new TowerRuleError('INVALID_REWARD', '보상 종류를 확인해 주세요.');
  const amount = number(r.amount, 1, 100000);
  if (!Number.isInteger(amount)) throw new TowerRuleError('INVALID_REWARD', '보상 수량은 정수여야 합니다.');
  return { type: r.type, amount, ...(r.type === 'CURRENCY' ? {} : { targetId: text(r.targetId) }) };
}
function boss(value: unknown): BossConfig {
  const b = object(value);
  return { presetId: text(b.presetId), firstReward: parseReward(b.firstReward), repeatReward: parseReward(b.repeatReward),
    ...(b.commonSceneId ? { commonSceneId: text(b.commonSceneId) } : {}), ...(b.protagonistSceneId ? { protagonistSceneId: text(b.protagonistSceneId) } : {}) };
}
export function parseSeason(value: unknown): Season {
  const s = object(value); const b = object(s.bosses); const weights = object(s.synergyWeights);
  return { id: text(s.id), name: text(s.name), description: typeof s.description === 'string' ? s.description.slice(0, 2000) : '',
    protagonistChampionId: text(s.protagonistChampionId),
    bosses: { boss1: boss(b.boss1), boss2: boss(b.boss2), boss3: boss(b.boss3), finalBoss: boss(b.finalBoss), ...(b.hiddenBoss ? { hiddenBoss: boss(b.hiddenBoss) } : {}) },
    ...(s.hiddenCondition ? { hiddenCondition: parseCondition(s.hiddenCondition) } : {}),
    synergyWeights: { deckTag: number(weights.deckTag, 0, 100), supportTag: number(weights.supportTag, 0, 100), championTag: number(weights.championTag, 0, 100) } };
}
export function parsePreset(value: unknown): Preset {
  const p = object(value);
  if (!Array.isArray(p.acts) || p.acts.some(act => !Number.isInteger(act) || act < 1 || act > 4)) throw new TowerRuleError('INVALID_CONFIG', 'ACT는 1~4입니다.');
  return { id: text(p.id), name: text(p.name), championId: text(p.championId), cardIds: deck(p.cardIds), acts: [...new Set(p.acts as number[])],
    difficulty: difficulty(p.difficulty), enabled: bool(p.enabled), weight: number(p.weight, 0, 10000) };
}
export function parseStarter(value: unknown): Starter {
  const s = object(value);
  return { id: text(s.id), name: text(s.name), championId: text(s.championId), cardIds: deck(s.cardIds), enabled: bool(s.enabled),
    isDefault: bool(s.isDefault), initiallyUnlocked: bool(s.initiallyUnlocked), ...(s.unlockCondition ? { unlockCondition: parseCondition(s.unlockCondition) } : {}) };
}
export function parseRelic(value: unknown): Relic {
  const r = object(value);
  if (!RELIC_TYPES.includes(r.effectType as Relic['effectType'])) throw new TowerRuleError('INVALID_RELIC', '유물 효과 종류를 확인해 주세요.');
  const values = object(r.values);
  const allowedKeys = ['attack', 'health', 'amount', 'reduction', 'threshold', 'heal', 'penalty'];
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.includes(key)) throw new TowerRuleError('INVALID_RELIC', '지원되지 않는 유물 수치입니다.');
    normalized[key] = number(value, 0, 25);
    if (!Number.isInteger(normalized[key])) throw new TowerRuleError('INVALID_RELIC', '유물 수치는 정수여야 합니다.');
  }
  return { id: text(r.id), name: text(r.name), description: text(r.description, 2000), effectType: r.effectType as Relic['effectType'], values: normalized,
    enabled: bool(r.enabled), initiallyUnlocked: bool(r.initiallyUnlocked), ...(r.imageUrl ? { imageUrl: safeImage(r.imageUrl) } : {}),
    ...(r.unlockCondition ? { unlockCondition: parseCondition(r.unlockCondition) } : {}) };
}
function safeImage(value: unknown): string {
  const url = text(value, 2000);
  if (!url.startsWith('/api/storage/objects/')) throw new TowerRuleError('INVALID_IMAGE', '기존 저장소에 업로드한 이미지를 사용해 주세요.'); return url;
}
export function parseCharacter(value: unknown): StoryCharacter {
  const c = object(value); const sprites = object(c.sprites); const result: StoryCharacter['sprites'] = {};
  for (const key of EXPRESSIONS) if (sprites[key]) result[key] = safeImage(sprites[key]);
  return { id: text(c.id), displayName: text(c.displayName), ...(c.championId ? { championId: text(c.championId) } : {}), sprites: result };
}
export function parseScene(value: unknown): Scene {
  const s = object(value);
  if (!Array.isArray(s.lines) || s.lines.length > 200) throw new TowerRuleError('INVALID_SCENE', '대사는 최대 200줄입니다.');
  return { id: text(s.id), name: text(s.name), lines: s.lines.map((value, order) => {
    const l = object(value);
    if (!EXPRESSIONS.includes(l.expression as typeof EXPRESSIONS[number]) || (l.side !== 'LEFT' && l.side !== 'RIGHT')) throw new TowerRuleError('INVALID_SCENE', '표정과 위치를 확인해 주세요.');
    return { speakerId: text(l.speakerId), expression: l.expression as typeof EXPRESSIONS[number], side: l.side as 'LEFT' | 'RIGHT', text: text(l.text, 2000), order };
  }) };
}
export function parseMetadata(value: unknown): { synergyTags: string[]; supportsTags: string[]; preferredSynergyTags: string[]; excluded: boolean } {
  const m = object(value);
  return { synergyTags: [...new Set(strings(m.synergyTags ?? [], 20))], supportsTags: [...new Set(strings(m.supportsTags ?? [], 20))],
    preferredSynergyTags: [...new Set(strings(m.preferredSynergyTags ?? [], 20))], excluded: m.excluded === true };
}

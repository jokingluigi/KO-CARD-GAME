import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { cardRecordToDefinition, type PublishedCardRecord } from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition, CardInstance } from "../cards/types";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../champions/published-champions";
import type { ChampionDefinition } from "../champions/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import type { ActionResult, GameAction } from "../actions/types";
import type { GameState } from "../types/game-state";
import { processChampionQuestEvents } from "../champions/quests";
import type { GameEvent } from "../events/types";

type Verdict = "PASS" | "FAIL" | "UNVERIFIED";
type CardQaResult = {
  name: string;
  id: string;
  type: string;
  verdict: Verdict;
  activation: Verdict;
  semantic: Verdict;
  tests: string[];
  notes: string[];
};
type ChampionQaResult = {
  name: string;
  id: string;
  base: Verdict;
  quest: Verdict;
  upgrade: Verdict;
  token: Verdict;
  notes: string[];
};

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? "http://127.0.0.1:8080";
const reportPath = process.env.KO_QA_REPORT ?? "qa-results/ko-card-ai-qa.md";
const requiredCardNames = [
  "나토마토",
  "RM우디르",
  "피 스타 세븐",
  "밀크 메이드",
  "씨 몬스터",
  "그레이트 챤",
  "뒷정리맨",
  "여울",
  "보드바",
  "조킹루이지",
  "디 오리진",
  "아비터",
  "워썬더",
  "플래티넘 구슬 마스터",
  "블랙 마카롱",
  "발단",
  "독세아",
  "하스이",
  "위리놈",
  "아르카나 조커",
  "루나",
  "흑구슬 마스터",
  "퍼플레인",
  "벨로나",
  "황소할배",
  "도쿵",
  "휴먼쿠커",
  "예거",
  "만드릴쿤",
  "팬텀 워커",
  "로드",
  "레이븐",
  "데헌",
  "카미사토르",
  "매드 펌킨",
  "판도라",
  "라 칼라베라",
  "스카드",
  "오심정정",
  "저지먼트",
];

const cardResponse = await fetch(`${apiOrigin}/api/cards`);
if (!cardResponse.ok) {
  throw new Error(`Published card catalog request failed: ${cardResponse.status}`);
}
const championResponse = await fetch(`${apiOrigin}/api/champions`);
if (!championResponse.ok) {
  throw new Error(`Published Champion catalog request failed: ${championResponse.status}`);
}

const cardRecords = ((await cardResponse.json()) as { cards?: PublishedCardRecord[] }).cards ?? [];
const championRecords =
  ((await championResponse.json()) as { champions?: PublishedChampionRecord[] }).champions ?? [];
const publishedCards = cardRecords
  .filter((card) => card.status === "PUBLISHED")
  .map(cardRecordToDefinition);
const publishedChampions = championRecords
  .filter((champion) => champion.status === "PUBLISHED")
  .map(championRecordToDefinition);

const cardResults: CardQaResult[] = [];
const championResults: ChampionQaResult[] = [];
const questLogs: Array<{
  champion: string;
  required: number;
  observed: boolean;
  verdict: Verdict;
  steps: string[];
  notes: string[];
}> = [];

function normalized(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function instance(definition: CardDefinition, instanceId: string, generated = false): CardInstance {
  return generateCardInstance(definition, { instanceId, isGenerated: generated });
}

function firstDefinition(
  definitions: readonly CardDefinition[],
  predicate: (definition: CardDefinition) => boolean,
  fallback: CardDefinition,
): CardDefinition {
  return definitions.find(predicate) ?? fallback;
}

function fixture(
  definitions: readonly CardDefinition[],
  champions: readonly ChampionDefinition[],
  source: CardDefinition,
): GameState {
  const fallback = source;
  const wrestler = firstDefinition(
    definitions,
    (definition) =>
      definition.cardType === "WRESTLER" &&
      !definition.isToken &&
      !definition.isChampionToken &&
      definition.id !== source.id,
    fallback,
  );
  const enemy = firstDefinition(
    definitions,
    (definition) => definition.cardType === "WRESTLER" && definition.id !== wrestler.id,
    wrestler,
  );
  const deckIds = definitions
    .filter((definition) => definition.cardType === "WRESTLER" && !definition.isToken)
    .map((definition) => definition.id);
  const championIds: [string, string] = [
    champions[0]?.id ?? "test-champion-quest",
    champions[1]?.id ?? "test-champion-no-quest",
  ];
  const state = createInitialGameState(
    championIds,
    definitions,
    champions,
    [deckIds, deckIds],
  );
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 1;
  state.randomSeed = 20260920;
  state.players = state.players.map((player) =>
    player.id === "player-1"
      ? {
          ...player,
          currentGold: 50,
          hand: [instance(source, `qa-source-${source.id}`)],
          board: [
            { ...instance(wrestler, `qa-ally-${source.id}`), boardSlot: 0 },
            null,
            null,
            null,
          ],
          deck: [
            instance(wrestler, `qa-deck-1-${source.id}`),
            instance(wrestler, `qa-deck-2-${source.id}`),
            instance(wrestler, `qa-deck-3-${source.id}`),
          ],
          graveyard: [instance(wrestler, `qa-grave-${source.id}`)],
          health: 18,
        }
      : {
          ...player,
          currentGold: 50,
          hand: [instance(enemy, `qa-enemy-hand-${source.id}`)],
          board: [
            { ...instance(enemy, `qa-enemy-1-${source.id}`), boardSlot: 0 },
            { ...instance(enemy, `qa-enemy-2-${source.id}`), boardSlot: 1 },
            null,
            null,
          ],
          deck: [instance(enemy, `qa-enemy-deck-${source.id}`)],
          graveyard: [instance(enemy, `qa-enemy-grave-${source.id}`)],
          health: 18,
        },
  );
  return state;
}

function settleAction(
  state: GameState,
  action: GameAction,
): { state: GameState; activation: Verdict; notes: string[] } {
  const notes: string[] = [];
  let result: ActionResult = executeAction(state, action);
  if (!result.success) {
    return {
      state: result.state,
      activation: "UNVERIFIED",
      notes: [`정상 경로가 ${result.errorCode}로 거부됨: ${result.message}`],
    };
  }

  let current = result.state;
  let invalidSelectionChecked = false;
  for (let step = 0; current.targetingState?.active; step += 1) {
    if (step > 50) {
      return { state: current, activation: "FAIL", notes: ["targeting continuation이 50단계 이상 지속됨"] };
    }
    const pending = current.targetingState;
    if (!invalidSelectionChecked) {
      const invalid = executeAction(current, {
        type: "SELECT_EFFECT_TARGET",
        playerId: pending.playerId,
        targetId: "__qa_invalid_target__",
      });
      if (invalid.success || invalid.state !== current) {
        return { state: current, activation: "FAIL", notes: ["invalid target selection이 거부되지 않음"] };
      }
      invalidSelectionChecked = true;
    }
    const targetId = pending.validTargetIds.find(
      (candidate) => !pending.selectedTargetIds.includes(candidate),
    );
    if (!targetId) {
      return {
        state: current,
        activation: "UNVERIFIED",
        notes: ["유효 target 후보가 없어 선택 continuation을 완료하지 못함"],
      };
    }
    result = executeAction(current, {
      type: "SELECT_EFFECT_TARGET",
      playerId: pending.playerId,
      targetId,
    });
    if (!result.success) {
      return {
        state: result.state,
        activation: "FAIL",
        notes: [`valid target selection 실패: ${result.errorCode}`],
      };
    }
    current = result.state;
  }
  return { state: current, activation: "PASS", notes };
}

function checkDefinitionContract(definition: CardDefinition): string[] {
  const notes: string[] = [];
  if (!definition.name || !definition.id) notes.push("id/name 누락");
  if (!["WRESTLER", "TECHNIQUE"].includes(definition.cardType ?? "")) {
    notes.push("알 수 없는 cardType");
  }
  if (!Number.isFinite(definition.cost) || !Number.isFinite(definition.attack) || !Number.isFinite(definition.health)) {
    notes.push("cost/attack/health가 유한 숫자가 아님");
  }
  const rawEffects = Array.isArray(definition.effectConfig?.effects)
    ? definition.effectConfig.effects.filter(
        (effect): effect is Record<string, unknown> => Boolean(effect) && typeof effect === "object",
      )
    : [];
  const runtimeEffects = definition.abilities.flatMap((ability) => ability.effects);
  for (const raw of rawEffects) {
    if (typeof raw.trigger !== "string" || typeof raw.action !== "string") {
      notes.push("effect config에 trigger/action이 없는 항목이 있음");
      continue;
    }
    const mapped = runtimeEffects.some(
      (effect) =>
        effect.type === "STRUCTURED" &&
        effect.action === raw.action &&
        definition.abilities.some((ability) => ability.trigger === raw.trigger),
    );
    if (!mapped) notes.push(`runtime mapping 누락: ${raw.trigger}/${raw.action}`);
  }
  return notes;
}

function runCardQa(definition: CardDefinition): CardQaResult {
  const notes = checkDefinitionContract(definition);
  const tests = ["published catalog contract", "normal action path"];
  if (notes.length) {
    return {
      name: definition.name,
      id: definition.id,
      type: definition.cardType ?? "UNKNOWN",
      verdict: "FAIL",
      activation: "UNVERIFIED",
      semantic: "UNVERIFIED",
      tests,
      notes,
    };
  }
  if (definition.isToken || definition.isChampionToken) {
    return {
      name: definition.name,
      id: definition.id,
      type: definition.cardType ?? "UNKNOWN",
      verdict: "UNVERIFIED",
      activation: "UNVERIFIED",
      semantic: "UNVERIFIED",
      tests,
      notes: ["token은 일반 hand-play가 아닌 summon/deploy 경로 대상"],
    };
  }
  try {
    const state = fixture(publishedCards, publishedChampions, definition);
    const source = state.players[0].hand[0];
    const action: GameAction =
      definition.cardType === "TECHNIQUE"
        ? { type: "PLAY_TECHNIQUE", playerId: "player-1", cardInstanceId: source.instanceId }
        : {
            type: "PLAY_WRESTLER",
            playerId: "player-1",
            cardInstanceId: source.instanceId,
            boardSlot: 3,
          };
    const settled = settleAction(state, action);
    notes.push(...settled.notes);
    if (settled.activation === "FAIL") {
      return {
        name: definition.name,
        id: definition.id,
        type: definition.cardType ?? "UNKNOWN",
        verdict: "FAIL",
        activation: "FAIL",
        semantic: "UNVERIFIED",
        tests,
        notes,
      };
    }
    const played = settled.state.events.some(
      (event) => event.type === "CARD_PLAYED" && event.cardInstanceId === source.instanceId,
    );
    if (!played) {
      notes.push("CARD_PLAYED event가 없음");
      return {
        name: definition.name,
        id: definition.id,
        type: definition.cardType ?? "UNKNOWN",
        verdict: "FAIL",
        activation: "FAIL",
        semantic: "UNVERIFIED",
        tests,
        notes,
      };
    }
    if (definition.cardType === "TECHNIQUE") {
      const inGraveyard = settled.state.players[0].graveyard.some(
        (card) => card.instanceId === source.instanceId,
      );
      if (!inGraveyard) notes.push("Technique이 사용 후 묘지에 없음");
    } else if (settled.state.players[0].hand.some((card) => card.instanceId === source.instanceId)) {
      notes.push("WRESTLER가 사용 후 손에 남아 있음");
    }
    const hasStructuredEffect = definition.abilities.some((ability) => ability.effects.length > 0);
    return {
      name: definition.name,
      id: definition.id,
      type: definition.cardType ?? "UNKNOWN",
      verdict: hasStructuredEffect ? "UNVERIFIED" : "PASS",
      activation: "PASS",
      semantic: hasStructuredEffect ? "UNVERIFIED" : "PASS",
      tests,
      notes: [
        ...notes,
        ...(hasStructuredEffect
          ? ["정상 Action/Event 경로는 실행했지만 효과 설명과 실제 수치의 differential oracle은 없음"]
          : []),
      ],
    };
  } catch (error) {
    return {
      name: definition.name,
      id: definition.id,
      type: definition.cardType ?? "UNKNOWN",
      verdict: "FAIL",
      activation: "FAIL",
      semantic: "UNVERIFIED",
      tests,
      notes: [`engine exception: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function runChampionQa(definition: ChampionDefinition): ChampionQaResult {
  const notes: string[] = [];
  let base: Verdict = "UNVERIFIED";
  try {
    const state = fixture(publishedCards, [definition, ...publishedChampions.filter((item) => item.id !== definition.id)], publishedCards[0]!);
    const abilityAction: GameAction = { type: "USE_CHAMPION_ABILITY", playerId: "player-1" };
    const settled = settleAction(state, abilityAction);
    if (settled.activation === "FAIL") {
      notes.push("Champion ability Action/Event 경로가 실패함");
    } else {
      const championBefore = state.players[0].champion;
      const championAfter = settled.state.players[0].champion;
      const beforeHand = state.players[0].hand;
      const afterHand = settled.state.players[0].hand;
      const beforeEnemyHealth = state.players[1].board
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => card.currentHealth);
      const afterEnemyHealth = settled.state.players[1].board
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => card.currentHealth);
      const beforeOwnBoardHealth = state.players[0].board
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => card.currentHealth);
      const afterOwnBoardHealth = settled.state.players[0].board
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => card.currentHealth);
      const generatedToken = settled.state.players[0].board.some(
        (card) => card?.definitionId === definition.ability.effects.find(
          (effect) => effect.type === "STRUCTURED" && effect.action === "SUMMON",
        )?.values?.definitionRef?.id,
      );
      const championName = normalized(definition.name);
      if (championName === normalized("챔피언 여울")) {
        base = settled.state.players[0].nextTurnGoldBonus === 1 ? "PASS" : "FAIL";
        if (base === "FAIL") notes.push("다음 턴 Gold bonus가 1이 아님");
      } else if (championName === normalized("챔피언 피 스타 세븐")) {
        const changed = afterHand.some((card, index) =>
          card.currentAttack > (beforeHand[index]?.currentAttack ?? card.currentAttack) ||
          card.currentHealth > (beforeHand[index]?.currentHealth ?? card.currentHealth),
        );
        base = changed ? "PASS" : "FAIL";
        if (!changed) notes.push("손의 WRESTLER +1/+1 결과를 확인하지 못함");
      } else if (championName === normalized("챔피언 판도라")) {
        const damagedAlly = afterOwnBoardHealth.some(
          (health, index) => health < (beforeOwnBoardHealth[index] ?? health),
        );
        base = damagedAlly ? "PASS" : "FAIL";
        if (!damagedAlly) notes.push("선택한 아군 WRESTLER damage 결과를 확인하지 못함");
      } else if (championName === normalized("챔피언 판도라(폭주)")) {
        const damaged = afterEnemyHealth.some(
          (health, index) => health < (beforeEnemyHealth[index] ?? health),
        );
        base = damaged ? "PASS" : "FAIL";
        if (!damaged) notes.push("선택한 적 WRESTLER damage 결과를 확인하지 못함");
      } else if (championName === normalized("챔피언 예거")) {
        base = generatedToken ? "PASS" : "FAIL";
        if (!generatedToken) notes.push("예거 ability의 SUMMON 결과가 board에 없음");
      } else {
        base = settled.activation === "PASS" ? "UNVERIFIED" : "FAIL";
      }
      if (championBefore?.id !== championAfter?.id) {
        notes.push("Champion identity가 ability 후 변경됨");
      }
      if (!settled.state.events.some((event) => event.type === "CHAMPION_ABILITY_USED")) {
        base = "FAIL";
        notes.push("CHAMPION_ABILITY_USED event가 없음");
      }
    }
    notes.push(...settled.notes);
  } catch (error) {
    base = "FAIL";
    notes.push(`engine exception: ${error instanceof Error ? error.message : String(error)}`);
  }

  let quest: Verdict = definition.quest ? "UNVERIFIED" : "PASS";
  if (definition.quest) {
    const required = definition.quest.requiredProgress;
    const expected =
      normalized(definition.name) === normalized("챔피언 예거")
        ? 7
        : normalized(definition.name) === normalized("챔피언 판도라")
          ? 5
          : required;
    const steps = Array.from({ length: required + 1 }, (_, index) => `${index}/${required}`);
    const notesForQuest: string[] = [];
    const questState = fixture(
      publishedCards,
      [definition, ...publishedChampions.filter((item) => item.id !== definition.id)],
      publishedCards[0]!,
    );
    const questEvents: GameEvent[] = Array.from({ length: required }, (_, index) => ({
      type: definition.quest!.trackedEvent === "WRESTLER_RETIRED" ? "CARD_RETIRED" : definition.quest!.trackedEvent,
      playerId: "player-1",
      cardInstanceId: `qa-quest-${definition.id}-${index}`,
      cardType: definition.quest!.cardType ?? "WRESTLER",
      boardSlot: 0,
      source: { type: "SYSTEM" },
      target: { type: "CARD", cardInstanceId: `qa-quest-${definition.id}-${index}` },
      reason: definition.quest!.trackedEvent === "WRESTLER_RETIRED" ? "RETIRE" : "CARD_EFFECT",
      ...(definition.quest!.sourceActionType
        ? {
            sourceContext: {
              sourcePlayerId: "player-1",
              sourceActionType: definition.quest!.sourceActionType,
              sourceChampionDefinitionId: definition.id,
            },
          }
        : {}),
    } as GameEvent));
    if (definition.quest.sourceActionType) {
      questEvents.unshift({
        ...questEvents[0]!,
        cardInstanceId: `qa-quest-noise-${definition.id}`,
        sourceContext: {
          sourcePlayerId: "player-1",
          sourceActionType: "ATTACK",
          sourceChampionDefinitionId: definition.id,
        },
      });
    }
    const progressed = processChampionQuestEvents(questState, {
      ...questState,
      events: [...questState.events, ...questEvents],
    });
    const progressedChampion = progressed.players[0]?.champion;
    const observed =
      progressedChampion?.questProgress === required &&
      progressedChampion.questCompleted === true &&
      progressed.events.some((event) => event.type === "CHAMPION_QUEST_COMPLETED");
    if (!observed) {
      quest = "FAIL";
      notesForQuest.push("quest event processor가 required progress/completion을 만들지 못함");
    }
    if (required !== expected) {
      quest = "FAIL";
      notesForQuest.push(`요청 기준 required=${expected}, published data는 ${required}`);
    }
    if (
      normalized(definition.name) === normalized("챔피언 판도라") &&
      definition.quest.sourceActionType !== "USE_CHAMPION_ABILITY"
    ) {
      quest = "FAIL";
      notesForQuest.push("sourceActionType이 USE_CHAMPION_ABILITY가 아님");
    }
    if (!notesForQuest.length) notesForQuest.push("deterministic quest event progression and completion passed");
    questLogs.push({
      champion: definition.name,
      required,
      observed,
      verdict: quest,
      steps,
      notes: notesForQuest,
    });
    notes.push(...notesForQuest);
  }

  const upgrade: Verdict = definition.upgradedAbility ? "UNVERIFIED" : "PASS";
  const token: Verdict = definition.championTokenDefinitionId
    ? publishedCards.some((card) => card.id === definition.championTokenDefinitionId)
      ? "PASS"
      : "FAIL"
    : "PASS";
  if (token === "FAIL") notes.push("linked Champion Token definition을 published card pool에서 찾지 못함");
  return { name: definition.name, id: definition.id, base, quest, upgrade, token, notes };
}

for (const definition of publishedCards) {
  test(`published card QA: ${definition.name} [${definition.id}]`, () => {
    const result = runCardQa(definition);
    cardResults.push(result);
    assert.notEqual(result.verdict, "FAIL", result.notes.join("; "));
  });
}

for (const definition of publishedChampions) {
  test(`published Champion QA: ${definition.name} [${definition.id}]`, () => {
    const result = runChampionQa(definition);
    championResults.push(result);
    assert.notEqual(result.base, "FAIL", result.notes.join("; "));
    assert.notEqual(result.quest, "FAIL", result.notes.join("; "));
  });
}

test.after(() => {
  const requiredFound = new Set(publishedCards.map((card) => normalized(card.name)));
  const missingKnownCards = requiredCardNames.filter((name) => !requiredFound.has(normalized(name)));
  const cardCounts = Object.fromEntries(
    (["PASS", "FAIL", "UNVERIFIED"] as Verdict[]).map((verdict) => [
      verdict,
      cardResults.filter((result) => result.verdict === verdict).length,
    ]),
  );
  const championCounts = Object.fromEntries(
    (["PASS", "FAIL", "UNVERIFIED"] as Verdict[]).map((verdict) => [
      verdict,
      championResults.filter(
        (result) =>
          result.base === verdict ||
          result.quest === verdict ||
          result.upgrade === verdict ||
          result.token === verdict,
      ).length,
    ]),
  );
  const lines = [
    "# KO CARD GAME AI/효과 QA 결과",
    "",
    `- API source: ${apiOrigin}`,
    `- Published cards: ${publishedCards.length}`,
    `- Published Champions: ${publishedChampions.length}`,
    `- Production DB/storage mutation: 없음 (development catalog snapshot was corrected before QA)`,
    `- Deterministic seed: 20260920`,
    "",
    "## 요약",
    "",
    `- 카드 verdict: PASS ${cardCounts.PASS} / FAIL ${cardCounts.FAIL} / UNVERIFIED ${cardCounts.UNVERIFIED}`,
    `- Champion dimension hits: PASS ${championCounts.PASS} / FAIL ${championCounts.FAIL} / UNVERIFIED ${championCounts.UNVERIFIED}`,
    `- 알려진 카드 목록 누락: ${missingKnownCards.length ? missingKnownCards.join(", ") : "없음"}`,
    "",
    "## 카드별 결과",
    "",
    "| 이름 | 타입 | 결과 | Action/Event | 설명/수치 비교 | 테스트 | 비고 |",
    "|---|---|---|---|---|---:|---|",
    ...cardResults.map(
      (result) =>
        `| ${result.name} | ${result.type} | ${result.verdict} | ${result.activation} | ${result.semantic} | ${result.tests.length} | ${result.notes.join(" / ") || "-"} |`,
    ),
    "",
    "## Champion별 결과",
    "",
    "| Champion | Base | Quest | Upgrade | Token | 비고 |",
    "|---|---|---|---|---|---|",
    ...championResults.map(
      (result) =>
        `| ${result.name} | ${result.base} | ${result.quest} | ${result.upgrade} | ${result.token} | ${result.notes.join(" / ") || "-"} |`,
    ),
    "",
    "## Quest 진행 로그",
    "",
    ...questLogs.flatMap((quest) => [
      `### ${quest.champion}: ${quest.verdict}`,
      `- observed deterministic engine progression: ${quest.observed ? "yes" : "no"}`,
      "- observed natural full-match progression: no",
      `- steps: ${quest.steps.join(" → ")}`,
      `- notes: ${quest.notes.join(" / ")}`,
      "",
    ]),
    "## FAIL 상세 재현",
    "",
    ...questLogs
      .filter((quest) => quest.verdict === "FAIL")
      .flatMap((quest) => [
        `- 대상: ${quest.champion}`,
        "- 초기 상태: published Champion snapshot, questProgress=0, deterministic CARD_GENERATED/CARD_RETIRED event fixture",
        "- 실행 흐름: 실제 quest event processor에 이벤트를 넣고 progress/completion event와 저장된 Champion state를 확인",
        `- 기대값: ${quest.champion === "챔피언 예거" ? "7회에서 7/7 완료 및 강화" : "published required count에서 완료"}`,
        `- 실제값: ${quest.steps.at(-1)}까지 완료 기준이 적용됨`,
        `- 관련 로그: ${quest.notes.join(" / ")}`,
        "- 심각도: Medium — 즉시 게임이 중단되지는 않지만 Quest reward/upgrade 시점이 달라짐",
        "",
      ]),
    "## STALE_TEST",
    "",
    "- `src/components/alt-inspector.test.ts`: Node 직접 실행 시 `import.meta.env.BASE_URL`가 없어 모듈 import 단계에서 실패했다. Vite 브라우저 환경 전용 테스트 설정 문제로 분류했으며 게임 엔진 버그로 집계하지 않았다.",
    "",
    "## 범위와 제한",
    "",
    "- 각 published card는 현재 API snapshot에서 수집한 실제 definition으로 일반 `PLAY_WRESTLER` 또는 `PLAY_TECHNIQUE` 경로를 실행했다.",
    "- target이 필요한 효과는 먼저 invalid target rejection을 확인한 뒤 deterministic fixture의 첫 valid target을 선택했다.",
    "- token은 일반 hand-play 대상이 아니므로 직접 play 대신 `UNVERIFIED`로 기록했다.",
    "- 효과 설명과 실제 결과의 완전한 differential oracle이 없는 항목은 `UNVERIFIED`이며, crash가 없었다는 이유만으로 PASS 처리하지 않았다.",
    "- 이 QA runner는 버그를 자동 수정하지 않는다.",
    "",
  ];
  const output = join(process.cwd(), reportPath);
  mkdirSync(join(output, ".."), { recursive: true });
  writeFileSync(output, `${lines.join("\n")}\n`);
  console.log(`QA report written: ${output}`);
});
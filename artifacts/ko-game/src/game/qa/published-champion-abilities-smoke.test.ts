import assert from "node:assert/strict";
import test from "node:test";

import { toServerAction } from "../../../../api-server/src/online/action-parser";
import { isOnlineClientMessage } from "../../../../api-server/src/online/client-message-parser";
import { ACTIONS, isEffectScript } from "@workspace/effect-registry";
import { generateCardInstance } from "../cards/generation";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../champions/published-champions";
import type { ChampionAbility, ChampionDefinition, ChampionEffect } from "../champions/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import type { GameAction } from "../actions/types";
import type { CardDefinition, CardInstance } from "../cards/types";
import type { GameState } from "../types/game-state";

type Verdict = "PASS" | "UNVERIFIED" | "FAIL";
type AbilityResult = {
  champion: string;
  ability: string;
  abilityId: string;
  verdict: Verdict;
  notes: string[];
};
type OnlineActionPayload = Record<string, unknown>;

let requestSequence = 0;

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? "http://localhost:80";
const cardsResponse = await fetch(`${apiOrigin}/api/cards`);
if (!cardsResponse.ok) {
  throw new Error(`Development published card catalog request failed: ${cardsResponse.status}`);
}
const championsResponse = await fetch(`${apiOrigin}/api/champions`);
if (!championsResponse.ok) {
  throw new Error(`Development published Champion catalog request failed: ${championsResponse.status}`);
}

const cardBody = (await cardsResponse.json()) as { cards?: PublishedCardRecord[] };
const championBody = (await championsResponse.json()) as { champions?: PublishedChampionRecord[] };
assert.ok(Array.isArray(cardBody.cards), "published card response is missing its cards array");
assert.ok(Array.isArray(championBody.champions), "published Champion response is missing its champions array");

const publishedCardRecords = cardBody.cards.filter((record) => record.status === "PUBLISHED");
const publishedChampionRecords = championBody.champions.filter((record) => record.status === "PUBLISHED");
assert.ok(publishedChampionRecords.length > 0, "Development catalog has no PUBLISHED Champions");
const cards = publishedCardRecords.map(cardRecordToDefinition);
const champions = publishedChampionRecords.map(championRecordToDefinition);
const championById = new Map(champions.map((champion) => [champion.id, champion]));
const cardById = new Map(cards.map((card) => [card.id, card]));
const results: AbilityResult[] = [];

function instance(definition: CardDefinition, instanceId: string): CardInstance {
  return generateCardInstance(definition, { instanceId, isGenerated: false });
}

function fixture(champion: ChampionDefinition, withLinkedToken = false): GameState {
  const wrestlers = cards.filter(
    (card) => card.cardType === "WRESTLER" && !card.isToken && !card.isChampionToken,
  );
  assert.ok(wrestlers.length > 0, "published catalog lacks a non-token WRESTLER needed for ability targets");
  const ally = wrestlers[0]!;
  const enemy = wrestlers.find((card) => card.id !== ally.id) ?? ally;
  const state = createInitialGameState(
    [champion.id, champions.find((item) => item.id !== champion.id)?.id ?? champion.id],
    cards,
    champions,
    [wrestlers.map((card) => card.id), wrestlers.map((card) => card.id)],
    { randomSeed: 20260920 },
  );
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 1;
  state.randomSeed = 20260920;
  state.players = state.players.map((player) =>
    player.id === "player-1"
      ? {
          ...player,
          currentGold: 99,
          health: Math.max(1, player.maxHealth - 5),
          champion: player.champion
            ? { ...player.champion, health: Math.max(1, player.maxHealth - 5) }
            : player.champion,
          hand: [instance(ally, `qa-champion-hand-${champion.id}`)],
          board: [
            { ...instance(ally, `qa-champion-ally-${champion.id}`), boardSlot: 0, currentHealth: 1, maxHealth: 1 },
            null,
            null,
            null,
          ],
          deck: [instance(ally, `qa-champion-deck-${champion.id}`)],
          graveyard: [instance(ally, `qa-champion-grave-${champion.id}`)],
        }
      : {
          ...player,
          currentGold: 99,
          board: [
            { ...instance(enemy, `qa-champion-enemy-1-${champion.id}`), boardSlot: 0, currentHealth: 10, maxHealth: 10 },
            { ...instance(enemy, `qa-champion-enemy-2-${champion.id}`), boardSlot: 1, currentHealth: 10, maxHealth: 10 },
            null,
            null,
          ],
          hand: [instance(enemy, `qa-champion-enemy-hand-${champion.id}`)],
          deck: [instance(enemy, `qa-champion-enemy-deck-${champion.id}`)],
          graveyard: [instance(enemy, `qa-champion-enemy-grave-${champion.id}`)],
        },
  );

  if (withLinkedToken && champion.championTokenDefinitionId) {
    const tokenDefinition = cardById.get(champion.championTokenDefinitionId);
    assert.ok(tokenDefinition, `published linked Champion Token missing: ${champion.championTokenDefinitionId}`);
    const player = state.players[0]!;
    const emptySlot = player.board.findIndex((card) => card === null);
    assert.notEqual(emptySlot, -1, "no empty board slot for linked Champion Token fixture");
    const token = {
      ...instance(tokenDefinition, `qa-linked-token-${champion.id}`),
      boardSlot: emptySlot as 0 | 1 | 2 | 3,
    };
    player.board[emptySlot] = token;
  }
  return state;
}

function parseOnlineAction(payload: OnlineActionPayload): GameAction {
  const serialized = JSON.stringify({
    type: "MATCH_ACTION",
    matchId: "qa-champion-ability-bridge",
    requestId: `qa-champion-ability-${requestSequence++}`,
    expectedVersion: requestSequence,
    action: payload,
  });
  const message: unknown = JSON.parse(serialized);
  assert.equal(isOnlineClientMessage(message), true, `online ingress rejected ${serialized}`);
  assert.ok(message && typeof message === "object" && "action" in message);
  const action = toServerAction(message.action, "player-1");
  assert.ok(action, `API action parser rejected ${serialized}`);
  return action;
}

function isPlayerChoiceAbility(ability: ChampionAbility): boolean {
  return ability.effects.some((effect) => {
    if (effect.type !== "STRUCTURED" || !effect.target || typeof effect.target !== "object") return false;
    return "selection" in effect.target && effect.target.selection === "PLAYER_CHOICE";
  });
}

function settleParsedSelections(state: GameState, firstTargetId?: string): GameState {
  let current = state;
  let preferredTargetId = firstTargetId;
  for (let step = 0; current.targetingState?.active; step += 1) {
    assert.ok(step < 50, "effect target continuation did not settle");
    const pending = current.targetingState;
    const targetId = preferredTargetId && pending.validTargetIds.includes(preferredTargetId)
      ? preferredTargetId
      : pending.validTargetIds.find((candidate) => !pending.selectedTargetIds.includes(candidate));
    assert.ok(targetId, "pending effect has no selectable target");
    preferredTargetId = undefined;
    const result = executeAction(
      current,
      parseOnlineAction({ type: "SELECT_EFFECT_TARGET", targetId }),
    );
    assert.equal(result.success, true, "API-parsed effect target selection failed");
    current = result.state;
  }
  return current;
}

function settleLocalSelections(state: GameState): GameState {
  let current = state;
  for (let step = 0; current.targetingState?.active; step += 1) {
    assert.ok(step < 50, "local effect target continuation did not settle");
    const pending = current.targetingState;
    const targetId = pending.validTargetIds.find(
      (candidate) => !pending.selectedTargetIds.includes(candidate),
    );
    assert.ok(targetId, "local pending effect has no selectable target");
    const result = executeAction(current, {
      type: "SELECT_EFFECT_TARGET",
      playerId: pending.playerId,
      targetId,
    });
    assert.equal(result.success, true, "direct local effect target selection failed");
    current = result.state;
  }
  return current;
}

function stripTargetingState(state: GameState): GameState {
  const { targetingState: _targetingState, ...settled } = state;
  return settled as GameState;
}

function actionStateSnapshot(state: GameState) {
  return {
    gold: state.players[0]!.currentGold,
    abilityUsed: state.players[0]!.championAbilityUsedThisTurn,
    quest: state.players[0]!.champion && {
      questProgress: state.players[0]!.champion.questProgress,
      questCompleted: state.players[0]!.champion.questCompleted,
    },
    events: state.events,
  };
}

function validateAbilityData(
  record: PublishedChampionRecord,
  upgraded: boolean,
  ability: ChampionAbility,
): string[] {
  const label = upgraded ? "upgradedAbilityEffects" : "abilityEffects";
  const raw = upgraded ? record.upgradedAbilityEffects : record.abilityEffects;
  const notes: string[] = [];
  if (!ability.id || !ability.name || !Array.isArray(ability.effects) || ability.effects.length === 0) {
    notes.push(`${label} maps to a missing/empty ability definition`);
    return notes;
  }
  if (!raw || typeof raw !== "object") {
    notes.push(`${label} is missing or not an object in the published record`);
    return notes;
  }
  const effectsAreArray = Array.isArray(raw.effects);
  const scriptsAreArray = Array.isArray(raw.scripts);
  const rawEffects = effectsAreArray ? raw.effects : [];
  const rawScripts = scriptsAreArray ? raw.scripts : [];
  if (raw.effects !== undefined && !effectsAreArray) {
    notes.push(`${label} effects field is present but not an array`);
  }
  if (raw.scripts !== undefined && !scriptsAreArray) {
    notes.push(`${label} scripts field is present but not an array`);
  }
  if (rawEffects.length + rawScripts.length === 0) {
    notes.push(`${label} has no published effects or scripts`);
  }
  for (const effect of rawEffects) {
    if (!effect || typeof effect.action !== "string" || !ACTIONS.includes(effect.action as (typeof ACTIONS)[number])) {
      notes.push(`${label} contains missing or unknown structured action: ${String(effect?.action)}`);
    }
  }
  for (const script of rawScripts) {
    if (!isEffectScript(script)) notes.push(`${label} contains an invalid effect script`);
  }
  const mapped = ability.effects;
  for (const effect of mapped) {
    if (effect.type === "STRUCTURED" && !ACTIONS.includes(effect.action as (typeof ACTIONS)[number])) {
      notes.push(`${label} converted an unknown structured action: ${effect.action}`);
    } else if (effect.type === "SCRIPT" && !isEffectScript(effect.script)) {
      notes.push(`${label} converted an invalid effect script`);
    }
  }
  return notes;
}

function observableEffectChange(before: GameState, after: GameState, abilityId: string): boolean {
  const playerFields = (state: GameState) => state.players.map((player) => ({
    health: player.health,
    board: player.board,
    hand: player.hand,
    deck: player.deck,
    graveyard: player.graveyard,
    removedFromGame: player.removedFromGame,
    champion: player.champion && {
      health: player.champion.health,
      questProgress: player.champion.questProgress,
      questCompleted: player.champion.questCompleted,
      ability: player.champion.ability,
      upgradedAbility: player.champion.upgradedAbility,
    },
    nextTurnGoldBonus: player.nextTurnGoldBonus,
  }));
  if (JSON.stringify(playerFields(before)) !== JSON.stringify(playerFields(after))) return true;
  return after.events.some((event) => {
    const context = "sourceContext" in event ? event.sourceContext : undefined;
    return context?.sourceAbilityId === abilityId && event.type !== "CHAMPION_ABILITY_USED";
  });
}

function runAbility(
  record: PublishedChampionRecord,
  champion: ChampionDefinition,
  ability: ChampionAbility,
  upgraded: boolean,
  linkedTokenActive = false,
): AbilityResult {
  const name = `${champion.name} / ${upgraded ? "upgraded" : "base"}${linkedTokenActive ? " / linked token active" : ""}`;
  const notes = validateAbilityData(record, upgraded, ability);
  assert.deepEqual(notes, [], `${name}: invalid published ability data: ${notes.join("; ")}`);

  const state = fixture(champion, linkedTokenActive);
  if (upgraded) {
    const player = state.players[0]!;
    assert.ok(champion.upgradedAbility, `${name}: upgraded ability missing from published conversion`);
    player.champion = player.champion
      ? { ...player.champion, questCompleted: true, upgradedAbility: champion.upgradedAbility }
      : player.champion;
  }
  const targeted = isPlayerChoiceAbility(ability);
  let finalState: GameState;

  if (targeted) {
    const beforeCommitSnapshot = actionStateSnapshot(state);
    const beginAction = parseOnlineAction({
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
    });
    const begun = executeAction(state, beginAction);
    assert.equal(begun.success, true, `${name}: BEGIN_TARGETED_ACTION was rejected`);
    assert.equal(begun.state.targetingState?.phase, "PRE_COMMIT", `${name}: precommit targeting phase missing`);
    assert.deepEqual(actionStateSnapshot(begun.state), beforeCommitSnapshot, `${name}: precommit changed committed action state`);
    assert.ok(begun.state.targetingState?.validTargetIds.length, `${name}: PRE_COMMIT has no valid targets`);

    const cancelBase = structuredClone(begun.state);
    const cancelled = executeAction(
      cancelBase,
      parseOnlineAction({ type: "CANCEL_EFFECT_TARGET" }),
    );
    assert.equal(cancelled.success, true, `${name}: API-parsed target cancellation failed`);
    assert.deepEqual(actionStateSnapshot(cancelled.state), beforeCommitSnapshot, `${name}: cancel changed gold/use/quest/events`);
    assert.deepEqual(
      stripTargetingState(cancelled.state),
      stripTargetingState(state),
      `${name}: cancel changed state beyond pending targeting`,
    );

    const selectedTargetId = begun.state.targetingState!.validTargetIds[0]!;
    const confirmAction = parseOnlineAction({
      type: "CONFIRM_PRECOMMIT_TARGET",
      targetId: selectedTargetId,
    });
    const confirmed = executeAction(begun.state, confirmAction);
    assert.equal(confirmed.success, true, `${name}: API-parsed target confirmation failed`);
    finalState = settleParsedSelections(confirmed.state);

    const direct = executeAction(state, { type: "USE_CHAMPION_ABILITY", playerId: "player-1" });
    assert.equal(direct.success, true, `${name}: direct local ability action was rejected`);
    assert.ok(direct.state.targetingState?.active, `${name}: direct local action did not open target selection`);
    assert.ok(
      direct.state.targetingState.validTargetIds.includes(selectedTargetId),
      `${name}: precommit target is not valid in direct local execution`,
    );
    const directSelection = executeAction(direct.state, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: selectedTargetId,
    });
    assert.equal(directSelection.success, true, `${name}: direct local target selection failed`);
    const directFinal = settleLocalSelections(directSelection.state);
    assert.deepEqual(
      finalState,
      directFinal,
      `${name}: online protocol path differs semantically from direct local execution`,
    );
    finalState = directFinal;
  } else {
    const directPayloadAction = parseOnlineAction({ type: "USE_CHAMPION_ABILITY" });
    const onlineResult = executeAction(state, directPayloadAction);
    assert.equal(onlineResult.success, true, `${name}: API-parsed USE_CHAMPION_ABILITY was rejected`);
    assert.equal(onlineResult.state.targetingState?.active ?? false, false, `${name}: targetless ability opened targeting`);
    finalState = onlineResult.state;
  }

  const abilityEvent = finalState.events.find(
    (event) => event.type === "CHAMPION_ABILITY_USED" && event.championId === champion.id,
  );
  assert.ok(abilityEvent, `${name}: CHAMPION_ABILITY_USED event missing`);
  assert.equal(abilityEvent.reason, ability.id, `${name}: ability event has wrong ability ID`);
  assert.equal(abilityEvent.sourceContext?.sourceActionType, "USE_CHAMPION_ABILITY");
  assert.equal(abilityEvent.sourceContext?.sourceAbilityId, ability.id);

  const abilityEvents = finalState.events.filter((event) => {
    const context = "sourceContext" in event ? event.sourceContext : undefined;
    return context?.sourceChampionDefinitionId === champion.id;
  });
  for (const event of abilityEvents) {
    const context = "sourceContext" in event ? event.sourceContext : undefined;
    assert.equal(
      context?.sourceActionType,
      "USE_CHAMPION_ABILITY",
      `${name}: ability-attributed event ${event.type} has incorrect sourceActionType`,
    );
  }

  const verdict: Verdict = observableEffectChange(state, finalState, ability.id) ? "PASS" : "UNVERIFIED";
  if (verdict === "UNVERIFIED") {
    notes.push("canonical action and ability event passed; effect has no simple observable state/event oracle");
  }
  return { champion: champion.name, ability: ability.name, abilityId: ability.id, verdict, notes };
}

for (const record of publishedChampionRecords) {
  const champion = championById.get(record.id)!;
  test(`published Champion base ability smoke: ${record.name} [${record.id}]`, () => {
    const result = runAbility(record, champion, champion.ability, false);
    results.push(result);
    assert.notEqual(result.verdict, "FAIL");

    const linkedTokenId = champion.championTokenDefinitionId;
    const doesDeployToken = champion.ability.effects.some(
      (effect: ChampionEffect) =>
        effect.type === "DIRECT_DEPLOY_CHAMPION_TOKEN" ||
        (effect.type === "STRUCTURED" && effect.action === "DEPLOY_CHAMPION_TOKEN"),
    );
    if (linkedTokenId && cardById.has(linkedTokenId) && !doesDeployToken) {
      const tokenActiveResult = runAbility(record, champion, champion.ability, false, true);
      results.push(tokenActiveResult);
      assert.notEqual(tokenActiveResult.verdict, "FAIL");
    }
  });

  if (record.upgradedAbilityName) {
    test(`published Champion upgraded ability smoke: ${record.name} [${record.id}]`, () => {
      assert.ok(champion.upgradedAbility, `${record.name}: published upgraded ability name did not map`);
      const result = runAbility(record, champion, champion.upgradedAbility, true);
      results.push(result);
      assert.notEqual(result.verdict, "FAIL");
    });
  }
}

test.after(() => {
  const dimensions = Object.fromEntries(
    (["PASS", "UNVERIFIED", "FAIL"] as Verdict[]).map((verdict) => [
      verdict,
      results.filter((result) => result.verdict === verdict).length,
    ]),
  );
  console.log(
    `Development Champion ability smoke (${apiOrigin}): ${publishedChampionRecords.length} PUBLISHED Champions; ` +
      `ability executions PASS ${dimensions.PASS} / UNVERIFIED ${dimensions.UNVERIFIED} / FAIL ${dimensions.FAIL}`,
  );
  for (const result of results) {
    console.log(
      `${result.verdict}: ${result.champion} — ${result.ability} [${result.abilityId}]` +
        (result.notes.length ? ` — ${result.notes.join("; ")}` : ""),
    );
  }
});
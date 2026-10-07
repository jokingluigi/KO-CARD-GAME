import { awaitChampionRewardSpace, findAwakeningRewardFrame, removeRewardFrame } from '../engine/champion-reward-replacement';
import type { GameState } from "../types/game-state";
import type { CardInstance } from "../cards/types";
import type {
  AwakeningPower,
  AwakeningStage,
  AwakeningState,
} from "./awakening-types";
import { generateCard } from "../cards/generation";
import { enterField } from "../engine/enter-field";
import { towerOpenSlot, canEnterTowerField } from "../tower/relics";
import { applyEffect } from "../effects/effect-engine";
import { processChampionQuestEvents } from "./quests";

function putSequence(
  state: GameState,
  playerId: string,
  awakening: AwakeningState,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId && p.champion
        ? { ...p, champion: { ...p.champion, awakening } }
        : p,
    ),
  };
}
export function hasAwakeningInvulnerability(
  state: GameState,
  playerId: string,
): boolean {
  const p = state.players.find((p) => p.id === playerId),
    sequence = p?.champion?.awakening;
  return Boolean(
    p &&
    sequence?.sequenceActive &&
    sequence.championInvulnerable &&
    sequence.activeStageInstanceId &&
    (sequence.pendingCounterCombatId ||
      p.board.some(
        (c) =>
          c?.instanceId === sequence.activeStageInstanceId &&
          c.awakening?.sequenceId === sequence.sequenceId &&
          c.awakening.stage === sequence.stage,
      )),
  );
}
export function hasAwakeningPassive(
  card: CardInstance | undefined | null,
  stage: AwakeningStage,
): boolean {
  return Boolean(
    card?.awakening?.stage === stage &&
    !card.isSilenced &&
    !card.isAbilityDisabled,
  );
}
export function beginAwakeningSequence(
  state: GameState,
  playerId: string,
): GameState {
  const p = state.players.find((p) => p.id === playerId),
    champion = p?.champion,
    config = champion?.quest?.awakening;
  if (
    !p ||
    !champion ||
    !config ||
    champion.awakening ||
    !champion.questCompleted ||
    state.status !== "IN_PROGRESS" ||
    p.health < 1 ||
    p.health > 5
  )
    return state;
  const awakeningPower = (5 - p.health) as AwakeningPower;
  return reconcileAwakeningSequences(
    putSequence(state, playerId, {
      sequenceId: `${state.gameId}:${playerId}:${champion.quest!.id}`,
      awakeningPower,
      sequenceActive: true,
      stage: "TANK",
      activeStageInstanceId: null,
      championInvulnerable: false,
      pendingStage: true,
    }),
  );
}

/** Field membership drives stages, independently of RETIRE/DESTROY triggers. */
export function reconcileAwakeningSequences(state: GameState): GameState {
  let next = state;
  for (const original of state.players)
    for (let transitions = 0; transitions < 4; transitions++) {
      let p = next.players.find((p) => p.id === original.id)!;
      const config = p.champion?.quest?.awakening;
      let sequence = p.champion?.awakening;
      if (!config || !sequence?.sequenceActive || sequence.stage === "FINISHED")
        break;
      if (next.status === "FINISHED") {
        next = putSequence(next, p.id, {
          ...sequence,
          sequenceActive: false,
          stage: "FINISHED",
          activeStageInstanceId: null,
          championInvulnerable: false,
          pendingStage: false,
        });
        break;
      }
      const stage = sequence.stage;
      const live = p.board.find(
        (c) =>
          c?.instanceId === sequence!.activeStageInstanceId &&
          c.definitionId === config.stageCardIds[stage] &&
          c.awakening?.sequenceId === sequence!.sequenceId &&
          c.awakening.stage === stage,
      );
      if (live) {
        if (
          sequence.pendingCounterCombatId &&
          !hasAwakeningPassive(live, "TANK")
        ) {
          next = putSequence(next, p.id, {
            ...sequence,
            lastCounterCombatId: sequence.pendingCounterCombatId,
          });
        }
        break;
      }
      // Combat triggers resolve normally, including RETIRE, before the post-combat counter.
      // The quest transition waits until that one counter has finished.
      if (sequence.pendingCounterCombatId) break;
      if (!sequence.pendingStage) {
        if (stage === "DEALER") {
          next = putSequence(next, p.id, {
            ...sequence,
            sequenceActive: false,
            stage: "FINISHED",
            activeStageInstanceId: null,
            championInvulnerable: false,
            pendingStage: false,
          });
          break;
        }
        sequence = {
          ...sequence,
          stage: stage === "TANK" ? "HEALER" : "DEALER",
          activeStageInstanceId: null,
          championInvulnerable: false,
          pendingStage: true,
        };
        next = putSequence(next, p.id, sequence);
      }
      const slot = towerOpenSlot(next, p.id);
      if (slot < 0 && (!p.board.every(Boolean) || !canEnterTowerField({ ...next, players: next.players.map(candidate => candidate.id !== p.id ? candidate : { ...candidate, board: [null, ...candidate.board.slice(1)] as typeof candidate.board }) }, p.id))) break;
      const rewardFrame = findAwakeningRewardFrame(next.targetingState, sequence.sequenceId, sequence.stage);
      const pendingCard = rewardFrame?.championRewardReplacement?.token;
      if (slot < 0 && pendingCard) break;
      p = next.players.find((candidate) => candidate.id === original.id)!;
      const definition = next.cardPool?.find(
        (d) => d.id === config.stageCardIds[sequence!.stage as AwakeningStage],
      );
      if (
        !definition?.questExclusive ||
        definition.awakeningStage !== sequence.stage ||
        definition.cardType !== "WRESTLER" ||
        definition.rarity !== "CHAMPION"
      ) {
        throw new Error("각성 전용 선수 정의를 확인해 주세요.");
      }
      const power = sequence.awakeningPower,
        baseAttack = definition.attack + power,
        baseHealth = definition.health + power;
      const instanceId = `${sequence.sequenceId}:${sequence.stage}`;
      const generated = generateCard(definition, {
        instanceId,
        playerId: p.id,
        source: { type: "CHAMPION", championId: p.champion!.id },
        reason: "AWAKENING_STAGE",
        creationEventIndex: next.events.length,
      });
      const card: CardInstance = {
        ...generated.card,
        baseAttack,
        baseHealth,
        currentAttack: baseAttack,
        currentHealth: baseHealth,
        maxHealth: baseHealth,
        awakening: {
          sequenceId: sequence.sequenceId,
          stage: sequence.stage as AwakeningStage,
          awakeningPower: power,
          baseAttack,
          baseHealth,
        },
      };
      if (slot < 0) {
        next = awaitChampionRewardSpace({ ...next, events: [...next.events, generated.event] }, p.id, p.champion!.id, card);
        break;
      }
      next = putSequence(
        { ...next, ...(pendingCard ? { targetingState: removeRewardFrame(next.targetingState, rewardFrame) } : {}),
          events: pendingCard ? next.events : [...next.events, generated.event] },
        p.id,
        {
          ...sequence,
          activeStageInstanceId: instanceId,
          championInvulnerable: true,
          pendingStage: false,
        },
      );
      next = enterField(
        next,
        p.id,
        pendingCard ?? card,
        slot as 0 | 1 | 2 | 3,
        { type: "CHAMPION", championId: p.champion!.id },
        undefined,
        "SUMMON",
      );
      // Entry listeners can immediately remove the new stage; reconcile again.
    }
  return next;
}

/** A damage substep checks the surviving HP before a later heal/damage substep. */
export function checkpointAwakening(
  previous: GameState,
  next: GameState,
): GameState {
  const eligible =
    next.status === "IN_PROGRESS" &&
    next.players.some(
      (p) =>
        p.champion?.quest?.awakening &&
        !p.champion.questCompleted &&
        p.health >= 1 &&
        p.health <= 5,
    );
  return reconcileAwakeningSequences(
    eligible ? processChampionQuestEvents(previous, next) : next,
  );
}

export function resolveAwakeningCounter(
  state: GameState,
  ownerId: string,
  tank: CardInstance,
  attackerId: string,
  combatId: string,
): GameState {
  const sequence = state.players.find((p) => p.id === ownerId)?.champion
    ?.awakening;
  const currentTank =
    state.players
      .find((p) => p.id === ownerId)
      ?.board.find((c) => c?.instanceId === tank.instanceId) ?? tank;
  const finish = (next: GameState): GameState => {
    const current = next.players.find((p) => p.id === ownerId)?.champion
      ?.awakening;
    return reconcileAwakeningSequences(
      current?.pendingCounterCombatId === combatId
        ? putSequence(next, ownerId, {
            ...current,
            pendingCounterCombatId: undefined,
            lastCounterCombatId: combatId,
          })
        : next,
    );
  };
  if (
    !hasAwakeningPassive(currentTank, "TANK") ||
    tank.awakening?.lastCounterCombatId === combatId ||
    sequence?.lastCounterCombatId === combatId ||
    state.status === "FINISHED"
  )
    return finish(state);
  const targetOwner = state.players.find((p) => p.id !== ownerId);
  if (!targetOwner?.board.some((c) => c?.instanceId === attackerId))
    return finish(state);
  const marked = {
    ...state,
    players: state.players.map((p) =>
      p.id !== ownerId
        ? p
        : {
            ...p,
            board: p.board.map((c) =>
              c?.instanceId === tank.instanceId
                ? {
                    ...c,
                    awakening: {
                      ...c.awakening!,
                      lastCounterCombatId: combatId,
                    },
                  }
                : c,
            ) as typeof p.board,
          },
    ),
  };
  return finish(
    applyEffect(
      marked,
      ownerId,
      tank,
      {
        type: "STRUCTURED",
        action: "DAMAGE",
        target: {
          zone: "BOARD",
          owner: "ENEMY",
          selection: "SAME_TARGET",
          count: 1,
        },
        values: { amount: 1 + tank.awakening!.awakeningPower },
      },
      [attackerId],
    ),
  );
}

export function prepareAwakeningCounter(
  state: GameState,
  ownerId: string,
  tank: CardInstance,
  combatId: string,
): GameState {
  const sequence = state.players.find((p) => p.id === ownerId)?.champion
    ?.awakening;
  return hasAwakeningPassive(tank, "TANK") &&
    sequence?.sequenceActive &&
    sequence.activeStageInstanceId === tank.instanceId
    ? putSequence(state, ownerId, {
        ...sequence,
        pendingCounterCombatId: combatId,
      })
    : state;
}

// Development-only fixture: actual engine, actual battle renderer, no network writes.
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/battle-presentation.css";
import "../src/mobile-battle.css";
import { ErrorBoundary } from "../src/components/error-boundary";
import { GameStatePreview } from "../src/components/game-state-preview";
import {
  createInitialGameState,
  generateCardInstance,
  setRuntimeCardDefinitions,
  executeAction,
  type GameState,
  type CardDefinition,
} from "../src/game";
import { emptyGameMediaCatalog } from "../src/game/media";
import {
  attackImpactLevel,
  attackDamageImpactLevel,
  type AttackAnimationState,
} from "../src/components/attack-animation-utils";
const noop = () => {};
const def: CardDefinition = {
  id: "combat-crash-unit",
  name: "공격 검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 3,
  health: 2,
  rulesText: "",
  keywords: [],
  abilities: [],
};
function initial() {
  const s = createInitialGameState(undefined, [def]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.events = [];
  for (const p of s.players) {
    p.hand = [];
    p.deck = [];
    p.board = [null, null, null, null];
    p.champion!.quest = undefined;
    p.board[0] = {
      ...generateCardInstance(def, { instanceId: p.id + "-unit" }),
      boardSlot: 0,
      enteredThisTurn: false,
    };
  }
  return s;
}
function Scene() {
  const [state, setState] = useState(initial),
    [selected, setSelected] = useState<string | null>(null),
    [animation, setAnimation] = useState<AttackAnimationState | null>(null);
  const pending = useRef<GameState | null>(null);
  useEffect(() => {
    const load = (event: Event) => {
      const d = (event as CustomEvent).detail;
      setRuntimeCardDefinitions(d.definitions);
      setState(d.state);
      setSelected(null);
      setAnimation(null);
      pending.current = null;
    };
    window.addEventListener("ko-qa-load-state", load);
    return () => window.removeEventListener("ko-qa-load-state", load);
  }, []);
  const attack = (id: string, geometry?: AttackAnimationState["geometry"]) => {
    const a = state.players[0].board.find((c) => c?.instanceId === selected),
      target = state.players[1].board.find((c) => c?.instanceId === id);
    if (!a || !target || !geometry) return;
    const result = executeAction(state, {
      type: "ATTACK",
      playerId: state.players[0].id,
      attackerInstanceId: a.instanceId,
      target: {
        type: "WRESTLER",
        playerId: state.players[1].id,
        cardInstanceId: id,
      },
    });
    if (!result.success) throw Error(result.message);
    pending.current = result.state;
    setSelected(null);
    const damage =
      result.state.events
        .slice(state.events.length)
        .find(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.target?.type === "CARD" &&
            e.target.cardInstanceId === id,
        )?.amount ?? 0;
    setAnimation({
      attacker: a,
      target,
      targetKind: "CARD",
      geometry,
      currentAttack: a.currentAttack,
      damage,
      impactLevel: attackImpactLevel(a.currentAttack),
      damageImpactLevel: attackDamageImpactLevel(damage),
      soundKey: "qa:" + state.gameId + ":" + state.events.length,
    });
  };
  return (
    <>
      <output data-testid="state-json" className="sr-only">
        {JSON.stringify(state)}
      </output>
      <GameStatePreview
        state={state}
        mediaCatalog={emptyGameMediaCatalog}
        selectedCardId={null}
        selectedAttackerId={selected}
        playError={null}
        turnSecondsRemaining={60}
        bgmMuted
        bgmVolume={0}
        onBgmMutedChange={noop}
        onBgmVolumeChange={noop}
        onSurrender={noop}
        onEndTurn={noop}
        onSelectCard={noop}
        onSelectSlot={noop}
        onUseTechnique={noop}
        playAnimation={null}
        onPlayAnimationComplete={noop}
        attackAnimation={animation}
        attackImpactTriggered={false}
        onAttackImpact={() => {
          if (pending.current) setState(pending.current);
        }}
        onAttackAnimationComplete={() => {
          setAnimation(null);
          pending.current = null;
        }}
        onSelectAttacker={setSelected}
        onAttackWrestler={attack}
        onAttackPlayer={noop}
        onUseActive={noop}
        onUseChampionAbility={noop}
        onCancelEffectTargeting={noop}
        onEffectTarget={noop}
        onPresentationBusyChange={noop}
      />
    </>
  );
}
setRuntimeCardDefinitions([def]);
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Scene />
  </ErrorBoundary>,
);

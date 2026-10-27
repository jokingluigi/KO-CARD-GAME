import type {MatchCosmetics} from "@workspace/cosmetics";
import {audioManager} from '../src/audio/audio-manager';
import {combatHitSound} from '../src/audio/combat-hit-sound';
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/battle-presentation.css";
import "../src/mobile-battle.css";
import { GameStatePreview } from "../src/components/game-state-preview";
import { executeAction } from "../src/game/actions/engine-actions";
import { setRuntimeCardDefinitions, type GameState } from "../src/game";
import {
  attackImpactLevel,
  attackDamageImpactLevel,
  type AttackAnimationState,
} from "../src/components/attack-animation-utils";
import {
  landingImpactLevel,
  type CardPlayAnimationState,
} from "../src/components/card-play-animation-utils";
import { emptyGameMediaCatalog } from "../src/game/media";
import { boardFixture, definitions } from "./black-gold-fixture";
if (!import.meta.env.DEV) throw Error("Development preview only");
setRuntimeCardDefinitions(definitions);
const noop = () => {};
function Scene() {
  const [cosmetics,setCosmetics]=useState<MatchCosmetics>({});
  const [state, setState] = useState(boardFixture),
    [selected, setSelected] = useState<string | null>(null),
    [attacker, setAttacker] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [play, setPlay] = useState<CardPlayAnimationState | null>(null);
  const attackSequence=useRef(0);
  const [attacks, setAttacks] = useState<AttackAnimationState[]>([]),
    [impact, setImpact] = useState(false);
  const [theme, setTheme] = useState(
    new URLSearchParams(location.search).get("theme") !== "classic",
  );
  function act(action: Parameters<typeof executeAction>[1]) {
    if (busy && action.type !== "EMOTE") return;
    const r = executeAction(state, action);
    setError(r.success ? null : r.message);
    setState(r.state);
    if (r.success) {
      setSelected(null);
      setAttacker(null);
    }
    return r;
  }
  useEffect(() => {
    const load = (e: Event) => {
      const next = (e as CustomEvent).detail;
      setCosmetics(next.cosmetics ?? {});
      setRuntimeCardDefinitions(next.definitions ?? definitions);
      setPlay(null);
      setAttacks([]);
      setImpact(false);
      setState(next.state);
      setSelected(null);
      setAttacker(null);
      setError(null);
    };
    window.addEventListener("ko-qa-load-state", load);
    return () => window.removeEventListener("ko-qa-load-state", load);
  }, []);
  function attack(
    id: string | null,
    geometry?: AttackAnimationState["geometry"],
  ) {
    const unit = state.players[0].board.find((c) => c?.instanceId === attacker);
    if (!unit) return;
    const target = id
      ? (state.players[1].board.find((c) => c?.instanceId === id) ?? null)
      : null;
    const r = act({
      type: "ATTACK",
      playerId: "player-1",
      attackerInstanceId: unit.instanceId,
      target: id
        ? { type: "WRESTLER", playerId: "player-2", cardInstanceId: id }
        : { type: "PLAYER", playerId: "player-2" },
    });
    if (r?.success && geometry) {
      const hit = r.state.events
        .slice(state.events.length)
        .find(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.source?.type === "CARD" &&
            e.source.cardInstanceId === unit.instanceId &&
            (id
              ? e.target?.type === "CARD" && e.target.cardInstanceId === id
              : e.target?.type === "PLAYER" &&
                e.target.playerId === "player-2"),
        );
      const damage = hit?.amount ?? 0;
      setAttacks((q) => [
        ...q,
        {
          attacker: unit,
          target,
          targetKind: id ? "CARD" : "CHAMPION",
          geometry,
          currentAttack: unit.currentAttack,
          damage,
          impactLevel: attackImpactLevel(unit.currentAttack),
          damageImpactLevel: attackDamageImpactLevel(damage),
          soundKey: "preview-" + (++attackSequence.current) + ":" + r.state.events.length,
        },
      ]);
    }
  }
  const target = (id: string) =>
    act({
      type:
        state.targetingState?.phase === "PRE_COMMIT"
          ? "CONFIRM_PRECOMMIT_TARGET"
          : "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: id,
    });
  return (
    <>
      <div
        data-preview-tools
        style={{
          position: "fixed",
          right: 4,
          bottom: 4,
          zIndex: 1000,
          fontSize: 12,
          background: "#121317",
          color: "#f0e8d8",
          padding: 4,
        }}
      >
        <button onClick={() => setTheme((v) => !v)}>기존 / 블랙·골드</button> ·{" "}
        <button
          onClick={() => {
            setState(boardFixture());
            setSelected(null);
            setAttacker(null);
            setError(null);
          }}
        >
          초기화
        </button>{" "}
        ·{" "}
        <button
          onClick={() => {
            if (state.activePlayerId !== "player-1")
              act({ type: "END_TURN", playerId: state.activePlayerId! });
          }}
        >
          상대 턴 종료
        </button>
      </div>
      <output data-testid="state-json" className="sr-only">
        {JSON.stringify(state)}
      </output>
      <output data-testid="preview-busy" className="sr-only">
        {String(busy)}
      </output>
      <GameStatePreview
        boardTheme={theme ? "BLACK_GOLD" : "CLASSIC"}
        state={state}
        mediaCatalog={emptyGameMediaCatalog}
        cosmetics={cosmetics}
        localImageEmotes
        selectedCardId={selected}
        selectedAttackerId={attacker}
        playError={error}
        turnSecondsRemaining={60}
        canEndTurn={
          !busy && state.activePlayerId === "player-1" && !state.targetingState
        }
        bgmMuted
        bgmVolume={0}
        onBgmMutedChange={noop}
        onBgmVolumeChange={noop}
        onSurrender={noop}
        onEmote={(emote) => act({ type: "EMOTE", playerId: "player-1", emote })}
        onEndTurn={() => act({ type: "END_TURN", playerId: "player-1" })}
        onSelectCard={(id) => setSelected((v) => (v === id ? null : id))}
        onSelectSlot={(slot, geometry) => {
          const card = state.players[0].hand.find(
            (c) => c.instanceId === selected,
          );
          if (selected && card) {
            const r = act({
              type: "PLAY_WRESTLER",
              playerId: "player-1",
              cardInstanceId: selected,
              boardSlot: slot,
            });
            if (r?.success && geometry)
              setPlay({
                kind: "WRESTLER",
                card,
                playerId: "player-1",
                geometry,
                impactLevel: landingImpactLevel(
                  card.baseCost,
                  card.currentCost,
                ),
              });
          }
        }}
        onUseTechnique={(id) =>
          act({
            type: "BEGIN_TARGETED_ACTION",
            playerId: "player-1",
            action: { type: "PLAY_TECHNIQUE", cardInstanceId: id },
          })
        }
        playAnimation={play}
        onPlayAnimationComplete={() => setPlay(null)}
        attackAnimation={attacks[0] ?? null}
        attackImpactTriggered={impact}
        onOpponentAttackPresentation={(a) => setAttacks((q) => [...q, a])}
        onAttackImpact={() => {setImpact(true);const a=attacks[0];if(a){const sound=combatHitSound(a.damage,a.finishingBlow);if(sound)audioManager.playAttack(sound,86);}}}
        onAttackAnimationComplete={() => {
          setAttacks((q) => q.slice(1));
          setImpact(false);
        }}
        onSelectAttacker={(id) =>
          state.targetingState
            ? target(id)
            : setAttacker((v) => (v === id ? null : id))
        }
        onAttackWrestler={(id, geometry) => attack(id, geometry)}
        onAttackPlayer={(geometry) => attack(null, geometry)}
        onUseActive={(id) =>
          act({ type: "USE_ACTIVE", playerId: "player-1", cardInstanceId: id })
        }
        onUseChampionAbility={() =>
          act({
            type: "BEGIN_TARGETED_ACTION",
            playerId: "player-1",
            action: { type: "USE_CHAMPION_ABILITY" },
          })
        }
        onEffectTarget={target}
        onCancelEffectTargeting={() =>
          act({ type: "CANCEL_EFFECT_TARGET", playerId: "player-1" })
        }
        onPresentationBusyChange={setBusy}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Scene />);

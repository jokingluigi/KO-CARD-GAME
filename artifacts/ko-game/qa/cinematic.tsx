// Development-only visual fixture. This is not an entry in the production build.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/battle-presentation.css";
import { AttackAnimation } from "../src/components/attack-animation";
import { CardPlayAnimation } from "../src/components/card-play-animation";
import { CardLeaveAnimation } from "../src/components/card-leave-animation";
import { PresentationFeedback } from "../src/components/presentation-feedback";
import { CardRenderer } from "../src/components/card-renderer";
import { QuestPresentation } from "../src/components/quest-presentation";
import { MatchResultOverlay } from "../src/components/match-result-overlay";
import {
  setRuntimeCardDefinitions,
  generateCardInstance,
  createInitialGameState,
  type CardDefinition,
} from "../src/game";
const definition: CardDefinition = {
  id: "qa-fighter",
  name: "링의 수호자",
  cardType: "WRESTLER",
  cost: 5,
  attack: 8,
  health: 7,
  rulesText: "도발. 링을 지키는 선수.",
  keywords: ["TAUNT"],
  rarity: "LEGENDARY",
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
const spell: CardDefinition = {
  ...definition,
  id: "qa-spell",
  name: "빛의 격돌",
  cardType: "TECHNIQUE",
  rarity: "EPIC",
  rulesText: "선택한 상대 선수에게 피해를 줍니다.",
  keywords: [],
};
setRuntimeCardDefinitions([definition, spell]);
const card = generateCardInstance(definition, { instanceId: "qa-attacker" });
const target = { ...card, instanceId: "qa-defender" };
const questState = createInitialGameState();
const defeatState = {...questState,status:'FINISHED' as const,winnerId:questState.players[0].id,loserId:questState.players[1].id,players:questState.players.map((p,i)=>i===1?{...p,health:0}:p),events:[{type:'DAMAGE_DEALT' as const,reason:'COMBAT',amount:1,source:{type:'CARD' as const,cardInstanceId:card.instanceId},target:{type:'PLAYER' as const,playerId:questState.players[1].id}}]};
function Scene() {
  const [kind, setKind] = useState("");
  const [counter, setCounter] = useState(0);
  const [impact, setImpact] = useState(0);
  const [complete, setComplete] = useState(0);
  const rect = (id: string) => {
    const r = document.getElementById(id)!.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
  const finish = () => {
    setComplete((value) => value + 1);
    setKind("");
  };
  const start = (value: string) => {
    setCounter((n) => n + 1);
    setKind(value);
  };
  const source = document.getElementById("qa-source")
    ? rect("qa-source")
    : { left: 30, top: 350, width: 120, height: 170 };
  const destination = document.getElementById("qa-target")
    ? rect("qa-target")
    : { left: 230, top: 100, width: 120, height: 170 };
  return (
    <main
      style={{
        minHeight: "100dvh",
        overflow: "hidden",
        background: "radial-gradient(ellipse at 50% 50%,#24252d,#0a0c13 75%)",
        color: "#f3ead7",
        padding: 16,
      }}
    >
      <header
        style={{
          position: "relative",
          zIndex: 400,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {[
          "attack",
          "blocked",
          "spell",
          "landing",
          "damage",
          "heal",
          "destroy",
          "retire",
          "quest",
          "reward",
          "reward-error",
          "defeat",
          "finisher",
        ].map((value) => (
          <button
            key={value}
            data-testid={value}
            onClick={() => start(value)}
            style={{
              padding: "8px 12px",
              background: "#24212a",
              border: "1px solid #776046",
              borderRadius: 8,
            }}
          >
            {value}
          </button>
        ))}
        <output
          data-testid="counts"
          style={{ fontSize: 12, width: "100%", textAlign: "center" }}
        >
          impact:{impact} complete:{complete}
        </output>
      </header>
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          top: "22%",
          bottom: "15%",
          border: "1px solid #9b815833",
          borderRadius: 30,
          background: "radial-gradient(ellipse,#37322e33,transparent 70%)",
          boxShadow: "inset 0 0 80px #0006",
        }}
      />
      <div
        id="qa-target"
        style={{
          position: "absolute",
          top: "24%",
          left: "58%",
          width: "clamp(90px,16vw,155px)",
          aspectRatio: "1060/1484",
        }}
      >
        <CardRenderer
          name="상대 선수"
          attack={4}
          health={7}
          cost={3}
          rulesText=""
          size="board"
          className="h-full w-full"
        />
      </div>
      <div
        id="qa-source"
        style={{
          position: "absolute",
          top: "60%",
          left: "20%",
          width: "clamp(90px,16vw,155px)",
          aspectRatio: "1060/1484",
        }}
      >
        <CardRenderer
          name={definition.name}
          attack={8}
          health={7}
          cost={5}
          rarity="LEGENDARY"
          rulesText={definition.rulesText}
          size="board"
          className="h-full w-full"
        />
      </div>
      {(kind === "attack" || kind === "blocked" || kind === "finisher") && (
        <AttackAnimation
          key={counter}
          animation={{
            attacker: card,
            target,
            targetKind: "CARD",
            geometry: { source, target: destination },
            currentAttack: kind === "finisher" ? 12 : 8,
            finishingBlow: kind === "finisher",
            impactLevel: "VERY_HEAVY",
            damage: kind === "blocked" ? 0 : kind === "finisher" ? 12 : 8,
            damageImpactLevel: kind === "blocked" ? "NONE" : "VERY_HEAVY",
            soundKey: `qa-${counter}`,
          }}
          onImpact={() => setImpact((n) => n + 1)}
          onComplete={finish}
        />
      )}
      {kind === "spell" && (
        <CardPlayAnimation
          key={counter}
          animation={{
            kind: "TECHNIQUE",
            card: generateCardInstance(spell, { instanceId: "qa-spell" }),
            playerId: "opponent",
            geometry: { source },
          }}
          viewerPlayerId="me"
          onComplete={finish}
        />
      )}
      {kind === "landing" && (
        <CardPlayAnimation
          key={counter}
          animation={{
            kind: "WRESTLER",
            card,
            geometry: { source: { left: 20, top: 40, width: Math.min(600, window.innerWidth - 40), height: 60 }, target: destination },
            impactLevel: "HEAVY",
          }}
          onComplete={finish}
        />
      )}
      {kind === "heal" && (
        <PresentationFeedback
          key={counter}
          cue={{
            id: `heal-${counter}`,
            kind: "HEAL",
            label: "+3 체력",
            value: 3,
            left: destination.left + destination.width / 2,
            top: destination.top + destination.height / 2,
            duration: 600,
          }}
          onComplete={finish}
        />
      )}
      {kind === 'damage' && <PresentationFeedback key={counter} cue={{id:`effect-${counter}`,kind:'DAMAGE',combat:false,label:'-6',value:6,left:destination.left+destination.width/2,top:destination.top+destination.height/2,duration:560}} onComplete={finish}/>}
      {(kind==='reward'||kind==='reward-error')&&<MatchResultOverlay state={{...questState,status:'FINISHED',winnerId:questState.players[0].id,loserId:questState.players[1].id}} reward={kind==='reward'?{amount:200,sourceType:'MATCH_AI_RESULT'}:null} rewardStatus="error" rewardError="퀘스트 진행도를 저장하지 못했습니다: AI 경기 행동을 확인할 수 없습니다." onReturnToMainMenu={finish}/>}
      {kind === "defeat" && <MatchResultOverlay state={defeatState} onReturnToMainMenu={finish}/>}
      {(kind === "destroy" || kind === "retire") && (
        <CardLeaveAnimation
          key={counter}
          animation={{
            id: `leave-${counter}`,
            kind: kind === "destroy" ? "DESTROY" : "RETIRE",
            card: target,
            geometry: destination,
            delay: 0,
          }}
          onComplete={finish}
        />
      )}
      {kind === "quest" && (
        <QuestPresentation
          key={counter}
          cue={{
            id: `quest-${counter}`,
            kind: "QUEST_COMPLETE",
            label: "퀘스트 성공",
            playerId: "player-1",
            left: 0,
            top: 0,
            duration: 820,
          }}
          state={questState}
          viewerPlayerId="player-1"
          onComplete={finish}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Scene />
  </React.StrictMode>,
);

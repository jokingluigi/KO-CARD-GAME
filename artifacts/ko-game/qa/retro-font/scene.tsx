import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "../../src/index.css";
import "../../src/battle-presentation.css";
import "../../src/mobile-battle.css";
import "./typography.css";
import fixtures from "./fixtures.json";
import { MainMenu } from "../../src/components/main-menu";
import { CardRenderer } from "../../src/components/card-renderer";
import {
  CardDetailDialog,
  type CardDetailRecord,
} from "../../src/components/card-detail-dialog";
import { CardRulesText } from "../../src/components/card-rules-text";
import {
  ChampionAbilityInspectContent,
  ChampionQuestInspectContent,
} from "../../src/components/alt-inspector";
import { TowerDialogueView } from "../../src/components/tower-dialogue-view";
import type {
  Scene,
  StoryCharacter,
} from "../../../../lib/game-engine/src/tower/types";
import { PresentationFeedback } from "../../src/components/presentation-feedback";
import { GameStatePreview } from "../../src/components/game-state-preview";
import {
  createInitialGameState,
  cardRecordToDefinition,
  championRecordToDefinition,
  generateCardInstance,
  setRuntimeCardDefinitions,
  emptyGameMediaCatalog,
  type GameState,
  type CardDefinition,
} from "../../src/game";
import type { AuthUser } from "../../src/lib/auth-client";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "baseline";
const scene = params.get("scene") ?? "menu";
document.documentElement.dataset.fontMode = ["full", "hybrid"].includes(mode)
  ? mode
  : "baseline";
// An isolated local fixture transport. No authenticated requests, POSTs or production API access.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input), location.href);
  if (url.pathname.startsWith("/api/")) {
    if ((init?.method ?? request?.method ?? "GET").toUpperCase() !== "GET")
      return Response.json({ error: "Preview is read only" }, { status: 405 });
    if (url.pathname === "/api/main-content")
      return Response.json(fixtures.main);
    if (url.pathname === "/api/tower/availability")
      return Response.json({ enabled: true });
    if (url.pathname === "/api/draft/availability")
      return Response.json({ enabled: false });
    if (url.pathname === "/api/card-frames")
      return Response.json(fixtures.frames);
    return Response.json(
      { error: "No fixture for this endpoint" },
      { status: 404 },
    );
  }
  if (url.origin !== location.origin)
    throw new Error("External requests are disabled in this preview");
  return originalFetch(input, init);
};
const records = fixtures.cards.map((c) => ({
  ...c,
  imageUrl: c.previewImageUrl,
}));
const definitions = records.map((c) =>
  cardRecordToDefinition(
    c as unknown as Parameters<typeof cardRecordToDefinition>[0],
  ),
);
const championDefinitions = fixtures.champions.map((c) =>
  championRecordToDefinition({
    ...c,
    imageUrl: c.previewImageUrl,
  } as unknown as Parameters<typeof championRecordToDefinition>[0]),
);
setRuntimeCardDefinitions(definitions);
function initialState(): GameState {
  const state = createInitialGameState(
    [championDefinitions[0]!.id, championDefinitions[1]!.id],
    definitions,
    championDefinitions,
  );
  state.status = "IN_PROGRESS";
  state.turn = 5;
  state.activePlayerId = "player-1";
  state.events = [];
  for (const [n, p] of state.players.entries()) {
    p.currentGold = 5;
    p.personalTurn = 3;
    p.deck = Array.from({ length: 20 }, (_, i) =>
      generateCardInstance(definitions[i % definitions.length]!, {
        instanceId: `${p.id}-deck-${i}`,
      }),
    );
    p.hand = definitions
      .slice(0, 4)
      .map((d, i) =>
        generateCardInstance(d, { instanceId: `${p.id}-hand-${i}` }),
      );
    p.board = [null, null, null, null];
    const wrestlers = definitions.filter((d) => d.cardType === "WRESTLER");
    for (let i = 0; i < 2; i++)
      p.board[i] = {
        ...generateCardInstance(wrestlers[(n + i) % wrestlers.length]!, {
          instanceId: `${p.id}-board-${i}`,
        }),
        boardSlot: i as 0 | 1,
        enteredThisTurn: false,
      };
    if (p.champion?.quest)
      p.champion.questProgress = Math.min(
        3,
        p.champion.quest.requiredProgress - 1,
      );
  }
  return state;
}
const fixtureState = initialState();
const user: AuthUser = {
  id: "local-font-review",
  email: "local-preview@example.invalid",
  nickname: "폰트 미리보기",
  role: "USER",
  currency: 1000,
  currencyBalance: 1000,
  prismBalance: 0,
  championPrismBalance: 0,
  isTestAccount: false,
};
const noop = () => {};
function CardView({
  definition,
  size,
}: {
  definition: CardDefinition;
  size: "board" | "detail";
}) {
  return (
    <CardRenderer
      cardId={definition.id}
      name={definition.name}
      cardType={definition.cardType}
      rarity={definition.rarity}
      cost={definition.cost}
      attack={definition.attack}
      health={definition.health}
      rulesText={definition.rulesText}
      keywords={definition.keywords}
      keywordConfig={definition.effectConfig}
      imageUrl={definition.imageUrl}
      size={size}
      onClick={noop}
      tabIndex={0}
    />
  );
}
function Cards() {
  const [selected, setSelected] = useState(
    records.reduce((a, b) => (a.text.length > b.text.length ? a : b)),
  );
  const [open, setOpen] = useState(false);
  return (
    <main className="qa-gallery">
      <h1>선수 · 주문 카드</h1>
      <div className="qa-card-gallery">
        {definitions.map((d) => (
          <section className="qa-card-case" key={d.id}>
            <p>{d.name}</p>
            <div
              className="qa-mini-card"
              data-card-id={d.id}
              onClick={() => setSelected(records.find((r) => r.id === d.id)!)}
            >
              <CardView definition={d} size="board" />
            </div>
          </section>
        ))}
      </div>
      <div className="qa-detail-card" data-card-id={selected.id}>
        <CardView
          definition={definitions.find((d) => d.id === selected.id)!}
          size="detail"
        />
      </div>
      <button className="qa-gallery-button" onClick={() => setOpen(true)}>
        카드 상세정보 열기
      </button>
      <CardDetailDialog
        card={selected as CardDetailRecord}
        open={open}
        onOpenChange={setOpen}
      />
    </main>
  );
}
function Champions() {
  return (
    <main className="qa-gallery">
      <h1>챔피언 · 능력 · 퀘스트</h1>
      <div className="qa-champions">
        {fixtureState.players.map((p) => (
          <article className="qa-champion-copy" key={p.id}>
            <h2>{p.champion!.name}</h2>
            <img src={p.champion!.imageUrl ?? ""} alt={p.champion!.name} />
            <ChampionAbilityInspectContent
              champion={p.champion!}
              available={true}
              unavailableReason=""
            />
            <section>
              <ChampionQuestInspectContent champion={p.champion!} />
            </section>
            <section>
              <ChampionAbilityInspectContent
                champion={{ ...p.champion!, questCompleted: true }}
                available={true}
                unavailableReason=""
              />
            </section>
          </article>
        ))}
      </div>
    </main>
  );
}
function Readability() {
  const longest = definitions.reduce((a, b) =>
    a.rulesText.length > b.rulesText.length ? a : b,
  );
  return (
    <main className="qa-gallery">
      <h1>장문 본문 · 한글 ABC 0123 +/−</h1>
      <section className="qa-body-case">
        <h2>{longest.name}</h2>
        <p className="qa-readable" data-testid="readability-card">
          <CardRulesText text={longest.rulesText} />
        </p>
      </section>
      {fixtureState.players.map((p) => (
        <section className="qa-body-case qa-champion-copy" key={p.id}>
          <h2>{p.champion!.name}</h2>
          <ChampionQuestInspectContent champion={p.champion!} />
          <section>
            <ChampionAbilityInspectContent
              champion={{ ...p.champion!, questCompleted: true }}
              available={true}
              unavailableReason=""
            />
          </section>
        </section>
      ))}
      <section className="qa-body-case qa-readable">
        <h2>타워 대화</h2>
        <TowerDialogueView
          scene={fixtures.towerScene as Scene}
          characters={fixtures.towerCharacters as StoryCharacter[]}
          index={0}
        />
      </section>
    </main>
  );
}
function Battle() {
  const [selected, setSelected] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  return (
    <>
      <GameStatePreview
        state={fixtureState}
        mediaCatalog={emptyGameMediaCatalog}
        selectedCardId={selected}
        selectedAttackerId={attacker}
        playError={null}
        turnSecondsRemaining={55}
        bgmMuted
        bgmVolume={0}
        onBgmMutedChange={noop}
        onBgmVolumeChange={noop}
        onSurrender={noop}
        onSelectCard={setSelected}
        onSelectAttacker={setAttacker}
        onEndTurn={noop}
        onSelectSlot={noop}
        onUseTechnique={noop}
        playAnimation={null}
        onPlayAnimationComplete={noop}
        attackAnimation={null}
        attackImpactTriggered={false}
        onAttackImpact={noop}
        onAttackAnimationComplete={noop}
        onAttackWrestler={noop}
        onAttackPlayer={noop}
        onUseActive={noop}
        onUseChampionAbility={noop}
        onPresentationBusyChange={noop}
        onCancelEffectTargeting={noop}
        onEffectTarget={noop}
        onEmote={noop}
      />
      {params.get("feedback") === "1" && (
        <>
          <PresentationFeedback
            cue={{
              id: "font-damage",
              kind: "DAMAGE",
              label: "-12",
              value: 12,
              combat: true,
              duration: 60000,
              left: innerWidth * 0.3,
              top: innerHeight * 0.27,
            }}
            onComplete={noop}
          />
          <PresentationFeedback
            cue={{
              id: "font-turn",
              kind: "TURN",
              label: "YOUR TURN",
              duration: 60000,
              left: innerWidth * 0.5,
              top: innerHeight * 0.5,
            }}
            onComplete={noop}
          />
        </>
      )}
    </>
  );
}
const memory = memoryLocation({ path: "/" });
createRoot(document.getElementById("root")!).render(
  <Router hook={memory.hook}>
    {scene === "menu" ? (
      <MainMenu
        user={user}
        onLogout={noop}
        onAiMatch={noop}
        onDeckEdit={noop}
      />
    ) : scene === "cards" ? (
      <Cards />
    ) : scene === "champions" ? (
      <Champions />
    ) : scene === "readability" ? (
      <Readability />
    ) : (
      <Battle />
    )}
  </Router>,
);
Object.assign(window, {
  __fontReview: {
    mode,
    scene,
    sourceSnapshot: fixtures.sourceSnapshot,
    state: fixtureState,
  },
});

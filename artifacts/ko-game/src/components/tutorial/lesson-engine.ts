import type { CardDefinition, ChampionDefinition, GameState } from "@/game";
import {
  createInitialGameState,
  startGame,
  generateCardInstance,
} from "../../game";
import type { GameAction } from "@/game/actions/types";
import { DECK_SIZE } from "../../game/rules/constants";
export const LESSONS = [
  {
    id: "basics",
    title: "첫 소환과 승리",
    detail: "멀리건 → 선수 소환 → 턴 종료 → 챔피언 공격",
  },
  {
    id: "combat",
    title: "선수끼리의 전투",
    detail: "공격·반격·체력 0의 리타이어 확인",
  },
  {
    id: "rush",
    title: "러쉬로 즉시 공격",
    detail: "일반 선수와 다른 소환 턴 공격",
  },
  {
    id: "spell",
    title: "주문과 대상 선택",
    detail: "확정 전 취소하고 다시 대상을 선택하기",
  },
  {
    id: "active",
    title: "액티브는 총 한 번",
    detail: "필드 선수의 액티브 사용",
  },
  {
    id: "champion",
    title: "고유능력과 퀘스트",
    detail: "실제 비용 지불로 퀘스트 완료·강화 확인",
  },
] as const;
export type LessonId = (typeof LESSONS)[number]["id"];
export interface TutorialCatalog {
  cards: CardDefinition[];
  champions: ChampionDefinition[];
  unit?: CardDefinition;
  spell?: CardDefinition;
  active?: CardDefinition;
  rush?: CardDefinition;
  champion?: ChampionDefinition;
}
/** Match only understood mechanics, never guess rules from card names or artwork. */
export function tutorialCatalog(
  cards: CardDefinition[],
  champions: ChampionDefinition[],
): TutorialCatalog {
  const usable = cards.filter(
    (c) => c.status === "PUBLISHED" && !c.isToken && !c.isChampionToken,
  );
  const unit = usable.find(
    (c) =>
      c.cardType === "WRESTLER" &&
      c.cost === 1 &&
      c.attack > 0 &&
      c.health > c.attack &&
      c.health <= c.attack * 2 &&
      !c.abilities.length &&
      !c.keywords.length &&
      !c.rulesText.trim(),
  );
  const rush = usable.find(
    (c) =>
      c.cardType === "WRESTLER" &&
      c.cost <= 6 &&
      c.attack > 0 &&
      c.health > 0 &&
      !c.abilities.length &&
      c.keywords.includes("RUSH") &&
      c.keywords.every((k) => k === "RUSH" || k === "WANTED"),
  );
  const active = usable.find(
    (c) =>
      c.cardType === "WRESTLER" &&
      c.cost <= 6 &&
      c.abilities.length === 1 &&
      !c.keywords.length &&
      c.abilities[0].trigger === "ACTIVE" &&
      c.abilities[0].effects.length === 1 &&
      c.abilities[0].effects[0].type === "STRUCTURED" &&
      c.abilities[0].effects[0].action === "SWAP_STATS",
  );
  const spell = usable.find((c) => {
    if (c.cardType !== "TECHNIQUE" || c.cost > 6 || c.abilities.length !== 1)
      return false;
    const effect = c.abilities[0].effects[0];
    if (c.abilities[0].effects.length !== 1 || effect?.type !== "SCRIPT")
      return false;
    const steps = effect.script.steps;
    return (
      steps.length === 2 &&
      steps[0].type === "SELECT" &&
      steps[0].target.zone === "BOARD" &&
      steps[0].target.owner === "ENEMY" &&
      steps[0].target.selection === "PLAYER_CHOICE" &&
      steps[0].target.count === 1 &&
      steps[1].type === "EFFECT" &&
      steps[1].effect.action === "STUN"
    );
  });
  const champion = champions.find(
    (c) =>
      c.status === "PUBLISHED" &&
      !c.gameStartAbility &&
      c.abilityCost > 0 &&
      c.abilityCost <= 6 &&
      c.quest?.goldSpent &&
      !c.quest.condition &&
      !c.quest.awakening &&
      c.quest.requiredProgress > c.abilityCost &&
      c.quest.reward.type === "UPGRADE_ABILITY" &&
      c.upgradedAbility &&
      c.ability.effects.length === 1 &&
      c.ability.effects[0].type === "STRUCTURED" &&
      c.ability.effects[0].action === "ADD_NEXT_TURN_GOLD",
  );
  return { cards, champions, unit, active, rush, spell, champion };
}
export function lessonUnavailable(
  c: TutorialCatalog,
  id: LessonId,
): string | null {
  if (!c.unit || !c.champion)
    return "현재 공개 카드에 이 실습에 맞는 기본 선수 또는 챔피언이 없어요.";
  if (id === "rush" && !c.rush)
    return "실습에 사용할 수 있는 공개 러쉬 선수가 필요해요.";
  if (id === "spell" && !c.spell)
    return "대상 하나를 골라 기절시키는 공개 주문이 필요해요.";
  if (id === "active" && !c.active)
    return "자신의 능력치를 교환하는 공개 액티브 선수가 필요해요.";
  return null;
}
/** Only local practice starting positions are prepared; all subsequent actions use the real engine. */
export function createTutorialLesson(
  c: TutorialCatalog,
  id: LessonId,
  gameId: string,
): GameState {
  const unavailable = lessonUnavailable(c, id);
  if (unavailable) throw Error(unavailable);
  const unit = c.unit!,
    champion = c.champion!;
  const deck = Array.from({ length: DECK_SIZE }, () => unit.id);
  let state = startGame(
    createInitialGameState(
      [champion.id, champion.id],
      c.cards,
      c.champions,
      [deck, deck],
      { gameId },
    ),
    () => 0.5,
  );
  state = {
    ...state,
    turn: id === "basics" ? 1 : 11,
    openingMulligan: id === "basics",
    players: state.players.map((p, i) => ({
      ...p,
      hand: [],
      board: [null, null, null, null],
      mulliganUsed: i === 1 || id !== "basics",
      currentGold: i === 1 ? 0 : id === "basics" ? 1 : 6,
      personalTurn: id === "basics" ? (i === 0 ? 1 : 0) : i === 0 ? 6 : 5,
    })),
  };
  const own = state.players[0],
    opponent = state.players[1];
  const instance = (d: CardDefinition, key: string) =>
    generateCardInstance(d, { instanceId: `${gameId}:${key}` });
  if (id === "basics") {
    own.hand = own.deck.splice(0, 3);
    opponent.health = unit.attack;
    opponent.champion!.health = unit.attack;
  } else if (id === "combat" || id === "active") {
    own.board[0] = {
      ...instance(id === "active" ? c.active! : unit, "own"),
      boardSlot: 0,
      enteredThisTurn: false,
      enteredOnTurn: 0,
    };
    if (id === "combat")
      opponent.board[0] = {
        ...instance(unit, "enemy"),
        boardSlot: 0,
        enteredThisTurn: false,
        enteredOnTurn: 0,
      };
  } else if (id === "rush") {
    own.hand = [instance(c.rush!, "rush")];
  } else if (id === "spell") {
    own.hand = [instance(c.spell!, "spell")];
    opponent.board[0] = {
      ...instance(unit, "enemy"),
      boardSlot: 0,
      enteredThisTurn: false,
      enteredOnTurn: 0,
    };
  } else {
    // The starting progress is explicitly disclosed in the lesson briefing.
    own.champion!.questProgress =
      champion.quest!.requiredProgress - champion.abilityCost;
  }
  return state;
}
export interface TutorialGoal {
  key: string;
  title: string;
  hint: string;
  focus: string;
  complete: boolean;
}
export function tutorialGoal(
  id: LessonId,
  s: GameState,
  c: TutorialCatalog,
  cancelled: boolean,
): TutorialGoal {
  const me = s.players[0],
    events = s.events.filter((e) => e.playerId === me.id);
  const goal = (
    key: string,
    title: string,
    hint: string,
    focus: string,
    complete = false,
  ) => ({ key, title, hint, focus, complete });
  if (id === "basics") {
    if (!me.mulliganUsed)
      return goal(
        "mulligan",
        "1/4 · 시작 손패 고르기",
        "바꾸고 싶은 카드를 누른 뒤 교체하거나, 그대로 시작을 누르세요.",
        "MULLIGAN",
      );
    if (!events.some((e) => e.type === "ENTER_FIELD"))
      return goal(
        "summon",
        "2/4 · 선수 소환",
        "손패의 1골드 선수를 고른 뒤 아군 빈 칸을 누르거나 드래그하세요.",
        "HAND",
      );
    if (me.personalTurn < 2)
      return goal(
        "turn",
        "3/4 · 다음 자기 턴 기다리기",
        "일반 선수는 소환한 턴에 공격할 수 없어요. 턴 종료를 누르세요. 연습 상대는 행동 없이 턴을 넘겨요.",
        "END_TURN",
      );
    return goal(
      "finish",
      "4/4 · 상대 챔피언 공격",
      "필드의 내 선수를 선택하고 상대 챔피언을 누르세요. 체력이 0이 되면 실제 승리 판정이 나요.",
      "OPPONENT",
      s.status === "FINISHED" && s.winnerId === me.id,
    );
  }
  if (id === "combat") {
    const attacks = events.filter(
      (e) => e.type === "ATTACK_DECLARED" && e.target?.type === "CARD",
    ).length;
    const retired = events.some((e) => e.type === "CARD_RETIRED");
    if (!attacks)
      return goal(
        "combatattack",
        "1/3 · 상대 선수 공격",
        "내 필드 선수를 선택한 뒤 상대 선수를 누르세요. 양쪽이 서로 공격력만큼 체력 피해를 주고받아요.",
        "ENEMY_BOARD",
      );
    if (!events.some((e) => e.type === "TURN_ENDED"))
      return goal(
        "combatturn",
        "2/3 · 다음 공격 준비",
        "양쪽 체력이 줄었어요. 이 선수의 이번 턴 공격은 끝났으니 턴 종료를 눌러 다음 자기 턴으로 가세요.",
        "END_TURN",
      );
    return goal(
      "combatretire",
      "3/3 · 체력 0과 리타이어",
      "같은 상대 선수를 다시 공격하세요. 일반 전투로 체력이 0이 된 선수의 실제 리타이어를 확인해요.",
      "ENEMY_BOARD",
      retired,
    );
  }
  if (id === "rush") {
    if (!events.some((e) => e.type === "ENTER_FIELD"))
      return goal(
        "rushsummon",
        "1/2 · 러쉬 선수 소환",
        "손패의 러쉬 선수를 아군 빈 칸에 소환하세요. 이 실습은 골드 6으로 시작해요.",
        "HAND",
      );
    return goal(
      "rushattack",
      "2/2 · 같은 턴에 바로 공격",
      "턴을 넘기지 말고 방금 소환한 선수를 선택해 상대 챔피언을 공격하세요. KO CARD GAME의 러쉬는 선수와 챔피언 모두 공격할 수 있어요.",
      "OPPONENT",
      events.some((e) => e.type === "ATTACK_DECLARED"),
    );
  }
  if (id === "spell") {
    if (!cancelled)
      return goal(
        "cancel",
        "1/2 · 대상 선택 취소",
        "손패의 주문을 선택해 사용을 누르고, 강조된 대상 대신 선택 취소를 눌러 보세요. 확정 전에는 카드와 골드를 쓰지 않아요.",
        "HAND",
      );
    return goal(
      "spell",
      "2/2 · 주문 효과 확정",
      "다시 주문을 사용하고 밝게 표시된 상대 선수를 누르세요. 이번에는 비용을 지불하고 기절시켜요.",
      "ENEMY_BOARD",
      events.some(
        (e) => e.type === "CARD_PLAYED" && e.cardType === "TECHNIQUE",
      ),
    );
  }
  if (id === "active")
    return goal(
      "active",
      "선수의 액티브 사용",
      "내 선수 위의 액티브 버튼을 누르세요. 이 선수는 이전 턴부터 필드에 있었어요. 사용 후에는 필드에 있는 동안 다시 쓸 수 없어요.",
      "OWN_BOARD",
      me.board.some((card) => card?.activeUsed === true),
    );
  return goal(
    "champion",
    "고유능력으로 퀘스트 완료",
    `${c.champion!.ability.name}을 사용하세요. 훈련 시작 시 퀘스트를 ${c.champion!.quest!.requiredProgress - c.champion!.abilityCost}/${c.champion!.quest!.requiredProgress}로 맞췄어요. 실제 비용 지불로 마지막 조건을 채워요.`,
    "ABILITY",
    events.some((e) => e.type === "CHAMPION_ABILITY_USED") &&
      me.champion?.questCompleted === true,
  );
}
export function tutorialActionAllowed(
  id: LessonId,
  goal: TutorialGoal,
  a: GameAction,
  cancelled: boolean,
): boolean {
  if (a.type === "EMOTE" || a.type === "CANCEL_EFFECT_TARGET") return true;
  if (goal.complete) return false;
  if (id === "basics")
    return goal.key === "mulligan"
      ? a.type === "MULLIGAN"
      : goal.key === "summon"
        ? a.type === "PLAY_WRESTLER"
        : goal.key === "turn"
          ? a.type === "END_TURN"
          : a.type === "ATTACK" && a.target.type === "PLAYER";
  if (id === "combat")
    return goal.focus === "END_TURN"
      ? a.type === "END_TURN"
      : a.type === "ATTACK" && a.target.type === "WRESTLER";
  if (id === "rush")
    return goal.key === "rushsummon"
      ? a.type === "PLAY_WRESTLER"
      : a.type === "ATTACK" && a.target.type === "PLAYER";
  const commit =
    a.type === "SELECT_EFFECT_TARGET" || a.type === "CONFIRM_PRECOMMIT_TARGET";
  if (id === "spell")
    return (
      (a.type === "BEGIN_TARGETED_ACTION" &&
        a.action.type === "PLAY_TECHNIQUE") ||
      a.type === "PLAY_TECHNIQUE" ||
      (cancelled && commit)
    );
  if (id === "active")
    return (
      a.type === "USE_ACTIVE" ||
      (a.type === "BEGIN_TARGETED_ACTION" && a.action.type === "USE_ACTIVE") ||
      commit
    );
  return (
    a.type === "USE_CHAMPION_ABILITY" ||
    (a.type === "BEGIN_TARGETED_ACTION" &&
      a.action.type === "USE_CHAMPION_ABILITY") ||
    commit
  );
}

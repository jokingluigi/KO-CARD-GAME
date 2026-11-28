import {
  currentChampionAbility,
  type ChampionState,
} from "../game/champions/types";
import { getCardDefinition } from "../game/cards/test-cards";
import type { GameState } from "../game/types/game-state";
import type { StructuredTarget } from "@workspace/effect-registry";

/** Choice ownership is independent of whose turn it is (including reactions). */
export function ownsEffectChoice(state: GameState, playerId: string): boolean {
  return Boolean(
    state.targetingState?.active && state.targetingState.playerId === playerId,
  );
}

export function targetDescription(target?: StructuredTarget): string {
  if (!target) return "효과에 표시된 대상";
  const owner =
    target.owner === "SELF"
      ? "아군"
      : target.owner === "ENEMY"
        ? "상대"
        : "아군 또는 상대";
  const zones = target.zones ?? (target.zone ? [target.zone] : []);
  const zone = zones
    .map(
      (zone) =>
        ({
          BOARD: "필드",
          HAND: "손패",
          DECK: "덱",
          GRAVEYARD: "묘지",
          PLAYER: "챔피언",
          CHARACTER: "선수 또는 챔피언",
        })[zone] ?? zone,
    )
    .join("·");
  const type =
    target.cardType === "WRESTLER"
      ? "선수"
      : target.cardType === "TECHNIQUE"
        ? "기술"
        : "";
  const filters = [
    target.filter?.excludeSource ? "이 카드 제외" : "",
    ...(target.filter?.tagsAll ?? []),
    ...(target.filter?.tagsAny?.length
      ? [target.filter.tagsAny.join(" 또는 ")]
      : []),
  ].filter(Boolean);
  return [owner, zone, type, filters.length ? `(${filters.join(" · ")})` : ""]
    .filter(Boolean)
    .join(" ");
}

export function championAbilityExplanation(
  champion: ChampionState | null | undefined,
) {
  const ability = currentChampionAbility(champion);
  if (!ability || !champion) return null;
  const targets = ability.effects.flatMap((effect) =>
    effect.type === "STRUCTURED" && effect.target?.selection === "PLAYER_CHOICE"
      ? [targetDescription(effect.target)]
      : [],
  );
  return {
    name: ability.name,
    description: ability.description,
    cost: ability.cost ?? champion.abilityCost,
    targets: [...new Set(targets)].join(" · "),
  };
}

/** Read the captured effect/ability; never infer Pandora's rules from its name. */
export function effectChoiceExplanation(state: GameState, viewerId: string) {
  if (!ownsEffectChoice(state, viewerId)) return null;
  const pending = state.targetingState!;
  const player = state.players.find((player) => player.id === pending.playerId);
  const source = pending.triggerContext?.sourceContext;
  const isChampion =
    pending.pendingAction?.type === "USE_CHAMPION_ABILITY" ||
    source?.sourceActionType === "USE_CHAMPION_ABILITY";
  const champion = player?.champion;
  const capturedAbility =
    champion &&
    [champion.abilityOverride, champion.ability, champion.upgradedAbility].find(
      (ability) => ability?.id === source?.sourceAbilityId,
    );
  const ability = isChampion
    ? championAbilityExplanation(
        champion && capturedAbility
          ? { ...champion, abilityOverride: capturedAbility }
          : champion,
      )
    : null;
  const definition =
    state.cardPool?.find(
      (card) => card.id === pending.sourceCard?.definitionId,
    ) ?? getCardDefinition(pending.sourceCard?.definitionId ?? "");
  const effect = pending.effects[pending.effectIndex];
  return {
    name: ability?.name ?? definition?.name ?? "효과",
    description:
      ability?.description ??
      pending.sourceCard?.grantedText?.rulesText ??
      definition?.rulesText ??
      "",
    target:
      effect?.type === "STRUCTURED"
        ? targetDescription(effect.target)
        : "강조된 대상",
    cost: ability
      ? `${pending.phase === "PRE_COMMIT" ? "확정 시" : "지불한 비용"} ${ability.cost}골드`
      : pending.pendingAction?.type === "PLAY_TECHNIQUE"
        ? `확정 시 ${pending.sourceCard?.currentCost ?? 0}골드`
        : "이미 시작된 효과 · 대상 선택 자체의 추가 비용 없음",
  };
}

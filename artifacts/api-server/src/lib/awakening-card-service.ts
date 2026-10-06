import { cardsTable, championsTable, db } from "@workspace/db";
import { createAwakeningCards, withCrisisAwakeningQuest } from "@workspace/game-engine";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Inserts missing exclusive definitions without overwriting administrator edits. */
export async function ensureAwakeningCards(
  transaction: Transaction,
): Promise<void> {
  await transaction
    .insert(cardsTable)
    .values(
      createAwakeningCards().map((card) => ({
        id: card.id,
        name: card.name,
        cardType: "WRESTLER",
        cost: card.cost,
        attack: card.attack,
        health: card.health,
        text: card.rulesText,
        rarity: "CHAMPION",
        isToken: true,
        isChampionToken: true,
        isStarterGrant: false,
        status: "DRAFT",
        keywords: [],
        tags: [],
        effectId: card.effectId,
        effectConfig: card.effectConfig,
      })),
    )
    .onConflictDoNothing();
}

export const AWAKENING_CHAMPION_ID = "crisis-awakening-champion";

/** An editable draft: names, art and ordinary ability are assigned by the owner. */
export async function ensureAwakeningContent(): Promise<void> {
  const champion = withCrisisAwakeningQuest({
    id: AWAKENING_CHAMPION_ID, name: "AWAKEN_CHAMPION", maxHealth: 20,
    abilityCost: 0,
    ability: { id: "crisis-awakening-ability", name: "관리자 설정 대기", description: "", effects: [] },
    quest: null, upgradedAbility: null,
  }, "WAIT_WITHOUT_INVULNERABILITY");
  const quest = champion.quest!;
  await db.transaction(async transaction => {
    await ensureAwakeningCards(transaction);
    await transaction.insert(championsTable).values({
      id: champion.id, name: champion.name, maxHealth: champion.maxHealth,
      description: "위기 각성 챔피언 초안. 이름·기본 HP·고유 능력·이미지를 관리자에서 설정해 주세요.",
      abilityName: champion.ability.name, abilityCost: 0, abilityText: "", abilityEffects: {},
      hasQuest: true, questName: quest.name, questText: quest.description,
      questProgressRequired: 1, questRewardText: quest.rewardText,
      questRewardEffects: null,
      questCondition: { event: "STATE_CONDITION", required: 1, condition: quest.condition, awakening: quest.awakening },
      status: "DRAFT", isCraftable: false, isStarterGrant: false,
    }).onConflictDoNothing();
  });
}

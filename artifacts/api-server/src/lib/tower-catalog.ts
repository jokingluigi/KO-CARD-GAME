import { eq } from 'drizzle-orm';
import { db, cardsTable, championsTable, towerSeasonsTable, towerStartersTable, towerPresetsTable, towerRelicsTable, towerCharactersTable, towerScenesTable, towerMetadataTable } from '@workspace/db';
import { TowerRuleError, cardRecordToDefinition, championRecordToDefinition, parseSeason, parseStarter, parsePreset, parseRelic, parseCharacter, parseScene, parseMetadata,
  eligibleRewardCard, validateTowerDeck, type TowerSnapshot, type TowerCatalog } from '@workspace/game-engine';
import { validateRewardTarget } from './reward-service';

/** A repeatable-read snapshot prevents mixed admin revisions in a newly created run. */
export async function loadTowerSnapshot(): Promise<TowerSnapshot> {
  return db.transaction(async tx => {
    const [season] = await tx.select().from(towerSeasonsTable).where(eq(towerSeasonsTable.active, true));
    if (!season) throw new TowerRuleError('SEASON_MISSING', '활성 타워 시즌이 없습니다.');
    const [cards, champions, starters, presets, relics, characters, scenes, metadata] = await Promise.all([
      tx.select().from(cardsTable), tx.select().from(championsTable), tx.select().from(towerStartersTable), tx.select().from(towerPresetsTable),
      tx.select().from(towerRelicsTable), tx.select().from(towerCharactersTable), tx.select().from(towerScenesTable), tx.select().from(towerMetadataTable),
    ]);
    const cardMetadata = new Map(metadata.filter(row => row.kind === 'CARD').map(row => [row.id, parseMetadata(row.data)]));
    const catalog: TowerCatalog = {
      season: parseSeason(season.data),
      cards: cards.map(card => ({ id: card.id, status: card.status, cost: card.cost, cardType: card.cardType as 'WRESTLER' | 'TECHNIQUE', rarity: card.rarity,
        isToken: card.isToken, isChampionToken: card.isChampionToken, synergyTags: cardMetadata.get(card.id)?.synergyTags ?? [],
        supportsTags: cardMetadata.get(card.id)?.supportsTags ?? [], excluded: cardMetadata.get(card.id)?.excluded ?? false })),
      starters: starters.map(row => parseStarter(row.data)), presets: presets.map(row => parsePreset(row.data)), relics: relics.map(row => parseRelic(row.data)),
      characters: characters.map(row => parseCharacter(row.data)), scenes: scenes.map(row => parseScene(row.data)),
      preferredTags: Object.fromEntries(metadata.filter(row => row.kind === 'CHAMPION').map(row => [row.id, parseMetadata(row.data).preferredSynergyTags])),
    };
    const championIds = new Set(champions.filter(champion => champion.status === 'PUBLISHED').map(champion => champion.id));
    if (!championIds.has(catalog.season.protagonistChampionId)) throw new TowerRuleError('CHAMPION_MISSING', '시즌 주인공 챔피언을 확인해 주세요.');
    for (const deck of [...catalog.starters, ...catalog.presets].filter(deck => deck.enabled)) {
      validateTowerDeck(deck.cardIds, catalog);
      if (!championIds.has(deck.championId)) throw new TowerRuleError('CHAMPION_MISSING', `${deck.name}: 공개된 챔피언이 필요합니다.`);
    }
    if (catalog.cards.filter(eligibleRewardCard).length < 3) throw new TowerRuleError('EMPTY_POOL', '카드 보상 후보가 부족합니다.');
    for (let act = 1; act <= 4; act++) {
      if (catalog.presets.filter(preset => preset.enabled && preset.weight > 0 && preset.acts.includes(act)).length < 2)
        throw new TowerRuleError('EMPTY_POOL', `ACT ${act}: 연속 중복을 피할 수 있도록 일반 덱 2개 이상이 필요합니다.`);
    }
    const speakerIds = new Set(catalog.characters.map(character => character.id));
    for (const scene of catalog.scenes) if (scene.lines.some(line => !speakerIds.has(line.speakerId))) throw new TowerRuleError('INVALID_SCENE', `${scene.name}: 등장인물을 확인해 주세요.`);
    for (const boss of Object.values(catalog.season.bosses)) {
      if (!catalog.presets.some(preset => preset.id === boss.presetId && preset.enabled)) throw new TowerRuleError('INVALID_BOSS', '보스 덱을 확인해 주세요.');
      for (const sceneId of [boss.commonSceneId, boss.protagonistSceneId].filter(Boolean))
        if (!catalog.scenes.some(scene => scene.id === sceneId)) throw new TowerRuleError('INVALID_SCENE', '보스 대화 장면을 확인해 주세요.');
      for (const reward of [boss.firstReward, boss.repeatReward])
        if (!await validateRewardTarget(reward.type, reward.targetId, tx)) throw new TowerRuleError('INVALID_REWARD', '보스 보상 대상을 확인해 주세요.');
    }
    // Include non-disabled token definitions for existing summon/transform effects;
    // eligibility is independently enforced for starters and rewards above.
    return { catalog,
      cards: cards.filter(card => card.status !== 'DISABLED').map(card => cardRecordToDefinition(card as unknown as Parameters<typeof cardRecordToDefinition>[0])),
      champions: champions.filter(champion => championIds.has(champion.id)).map(champion => championRecordToDefinition(champion as unknown as Parameters<typeof championRecordToDefinition>[0])),
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

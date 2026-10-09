import { listAIDecks } from './ai-deck-service';
import { TOWER_VANILLA_CHAMPION_ID } from '@workspace/game-engine';
import { eq, desc } from 'drizzle-orm';
import { db, cardsTable, championsTable, towerSeasonsTable, towerStartersTable, towerPresetsTable, towerRelicsTable, towerCharactersTable, towerScenesTable, towerMetadataTable, towerVersionsTable } from '@workspace/db';
import { completeMinionACatalog, TowerRuleError, cardRecordToDefinition, championRecordToDefinition, parseSeason, parseStarter, parsePreset, parseRelic, parseCharacter, parseScene, parseMetadata,
  eligibleRewardCard, validateTowerDeck, validateTowerV2, type Condition, type TowerSnapshot, type TowerCatalog } from '@workspace/game-engine';
import { validateRewardTarget } from './reward-service';

/** A repeatable-read snapshot prevents mixed admin revisions in a newly created run. */
export async function loadTowerSnapshot(database: typeof db = db, towerId?:string, draft=false): Promise<TowerSnapshot> {
  return database.transaction(async tx => {
    let [season] = await tx.select().from(towerSeasonsTable).where(towerId?eq(towerSeasonsTable.id,towerId):eq(towerSeasonsTable.active, true));
    if (!season && !towerId) { const definitions=await tx.select().from(towerSeasonsTable);const versions=await tx.select({towerId:towerVersionsTable.towerId}).from(towerVersionsTable);const published=new Set(versions.map(v=>v.towerId));season=definitions.filter(d=>{const v=d.data.v2 as any;return v?.enabled&&v.visible&&published.has(d.id);}).sort((a,b)=>Number((a.data.v2 as any).sortOrder)-Number((b.data.v2 as any).sortOrder))[0]; }
    if (!season) throw new TowerRuleError('SEASON_MISSING', '활성 타워 시즌이 없습니다.');
    if(season.data.v2 && !draft){
      const current=season.data.v2 as any;if(!current.enabled||!current.visible)throw new TowerRuleError('TOWER_DISABLED','타워가 비활성 또는 비공개입니다.');
      const [published]=await tx.select().from(towerVersionsTable).where(eq(towerVersionsTable.towerId,season.id)).orderBy(desc(towerVersionsTable.version)).limit(1);
      if(!published)throw new TowerRuleError('TOWER_UNPUBLISHED','공개된 타워 버전이 없습니다.');
      const frozen=structuredClone(published.snapshot) as unknown as TowerSnapshot;
      if(!frozen.catalog.season.v2?.enabled||!frozen.catalog.season.v2.visible)throw new TowerRuleError('TOWER_DISABLED','타워가 비활성 또는 비공개입니다.');
      return {...frozen,contentVersion:published.version};
    }
    const [cards, champions, starters, presets, relics, characters, scenes, metadata] = await Promise.all([
      tx.select().from(cardsTable), tx.select().from(championsTable), tx.select().from(towerStartersTable), tx.select().from(towerPresetsTable),
      tx.select().from(towerRelicsTable), tx.select().from(towerCharactersTable), tx.select().from(towerScenesTable), tx.select().from(towerMetadataTable),
    ]);
    const cardMetadata = new Map(metadata.filter(row => row.kind === 'CARD').map(row => [row.id, parseMetadata(row.data)]));
    const catalog: TowerCatalog = {
      season: parseSeason(season.data),
      cards: cards.map(card => ({ id: card.id, status: card.status, cost: card.cost, cardType: card.cardType as 'WRESTLER' | 'TECHNIQUE', rarity: card.rarity,
        isToken: card.isToken, isChampionToken: card.isChampionToken, synergyTags: [...new Set([...(card.tags??[]),...(cardMetadata.get(card.id)?.synergyTags??[])])],
        supportsTags: cardMetadata.get(card.id)?.supportsTags ?? [], excluded: !season.data.v2 && (cardMetadata.get(card.id)?.excluded ?? false), effectTags: [...new Set([...(card.keywords??[]),...collectEffectTags(cardRecordToDefinition(card as any).abilities)])], executable: !card.effectId || cardRecordToDefinition(card as any).abilities.length>0 })),
      starters: starters.map(row => parseStarter(row.data)), presets: presets.map(row => parsePreset(row.data)), relics: relics.map(row => parseRelic(row.data)),
      characters: characters.map(row => parseCharacter(row.data)), scenes: scenes.map(row => parseScene(row.data)),
      preferredTags: Object.fromEntries(champions.map(c=>[c.id,[...new Set([...(metadata.find(m=>m.kind==='CHAMPION'&&m.id===c.id)?parseMetadata(metadata.find(m=>m.kind==='CHAMPION'&&m.id===c.id)!.data).preferredSynergyTags:[]),...collectFilterTags(championRecordToDefinition(c as any))])]])),
      championEffectTags:Object.fromEntries(champions.map(c=>[c.id,collectEffectTags(championRecordToDefinition(c as any))])),
    };
    const aiDecks = (await listAIDecks({ enabledOnly: true, context: 'AI_DECK' }, tx)).filter(deck => deck.isValid);
    catalog.presets.push(...aiDecks.map(deck => ({ id: `ai-deck:${deck.id}`, name: deck.name, championId: deck.championDefinitionId!, cardIds: deck.cardDefinitionIds, enabled: true, acts: [], weight: 0, difficulty: 'BOSS' as const })));
    for (const [index, boss] of (catalog.season.v2?[]:Object.values(catalog.season.bosses)).entries()) {
      if (!boss.presetId.startsWith('ai-deck:')) {
        const deck = aiDecks[index % aiDecks.length];
        if (!deck) throw new TowerRuleError('INVALID_BOSS', '보스전에 사용할 활성 AI 매치 덱이 필요합니다.');
        boss.presetId = `ai-deck:${deck.id}`;
      }
    }
    const aiChampionIds = new Set(aiDecks.map(deck => deck.championDefinitionId));
    const championIds = new Set(champions.filter(champion => catalog.season.v2?champion.status !== 'DISABLED':champion.status === 'PUBLISHED').map(champion => champion.id));
    if (!catalog.season.v2 && !championIds.has(catalog.season.protagonistChampionId)) throw new TowerRuleError('CHAMPION_MISSING', '시즌 주인공 챔피언을 확인해 주세요.');
    for (const deck of [...catalog.starters, ...(catalog.season.v2?[]:catalog.presets)].filter(deck => deck.enabled && !deck.id.startsWith('ai-deck:'))) {
      validateTowerDeck(deck.cardIds, catalog);
      if (!championIds.has(deck.championId)) throw new TowerRuleError('CHAMPION_MISSING', `${deck.name}: 공개된 챔피언이 필요합니다.`);
    }
    if (!catalog.starters.some(starter => starter.enabled)) throw new TowerRuleError('EMPTY_POOL', '활성 스타터 덱이 필요합니다.');
    if (!catalog.season.v2 && catalog.relics.filter(relic => relic.enabled).length < 9) throw new TowerRuleError('RELIC_POOL_TOO_SMALL', '중복 없는 보스 유물 후보를 위해 활성 유물 9종 이상이 필요합니다.');
    const validateCondition = (condition: Condition | undefined): void => {
      if (!condition) return;
      if (condition.type === 'ALL' || condition.type === 'ANY') { condition.conditions.forEach(validateCondition); return; }
      let valid = true;
      if (condition.type === 'CHAMPION') valid = championIds.has(condition.id);
      else if (condition.type === 'CARD') valid = catalog.cards.some(card => card.id === condition.id && eligibleRewardCard(card));
      else if (condition.type === 'RELIC') valid = catalog.relics.some(relic => relic.id === condition.id);
      else if (condition.type === 'STARTER') valid = catalog.starters.some(starter => starter.id === condition.id);
      else if (condition.type === 'BOSS_CLEARED') valid = catalog.season.v2?catalog.season.v2.bosses.some(b=>b.id===condition.id):Object.hasOwn(catalog.season.bosses, condition.id);
      if (!valid) throw new TowerRuleError('INVALID_CONDITION', '조건이 참조하는 챔피언·카드·유물·스타터·보스를 확인해 주세요.');
    };
    validateCondition(catalog.season.hiddenCondition);
    for (const item of [...catalog.starters, ...catalog.relics].filter(item => item.enabled)) validateCondition(item.unlockCondition);
    if (catalog.cards.filter(eligibleRewardCard).length < (catalog.season.v2?1:3)) throw new TowerRuleError('EMPTY_POOL', '카드 보상 후보가 부족합니다.');
    for (let act = 1; !catalog.season.v2 && act <= 4; act++) {
      if (catalog.presets.filter(preset => preset.enabled && preset.weight > 0 && preset.acts.includes(act)).length < 2)
        throw new TowerRuleError('EMPTY_POOL', `ACT ${act}: 연속 중복을 피할 수 있도록 일반 덱 2개 이상이 필요합니다.`);
    }
    const speakerIds = new Set(catalog.characters.map(character => character.id));
    for (const scene of catalog.scenes) if (scene.lines.some(line => !speakerIds.has(line.speakerId))) throw new TowerRuleError('INVALID_SCENE', `${scene.name}: 등장인물을 확인해 주세요.`);
    for (const boss of catalog.season.v2?[]:Object.values(catalog.season.bosses)) {
      if (!catalog.presets.some(preset => preset.id === boss.presetId && preset.enabled)) throw new TowerRuleError('INVALID_BOSS', '보스 덱을 확인해 주세요.');
      for (const sceneId of [boss.commonSceneId, boss.protagonistSceneId].filter(Boolean))
        if (!catalog.scenes.some(scene => scene.id === sceneId)) throw new TowerRuleError('INVALID_SCENE', '보스 대화 장면을 확인해 주세요.');
      for (const reward of [boss.firstReward, boss.repeatReward])
        if (!await validateRewardTarget(reward.type, reward.targetId, tx)) throw new TowerRuleError('INVALID_REWARD', '보스 보상 대상을 확인해 주세요.');
    }
    if(catalog.season.v2){
      validateTowerV2(catalog.season.v2,catalog);
      const allChampionIds=new Set(champions.filter(c=>c.status!=='DISABLED').map(c=>c.id));
      for(const enemy of [...catalog.season.v2.floors.flatMap(f=>f.enemies),...catalog.season.v2.bosses])if(!allChampionIds.has(enemy.championId))throw new TowerRuleError('CHAMPION_MISSING','적 챔피언이 존재하지 않습니다.');
      const sceneIds=new Set(catalog.scenes.map(s=>s.id));
      for(const id of [...catalog.season.v2.floors.map(f=>f.sceneId),...catalog.season.v2.bosses.map(b=>b.sceneId),catalog.season.v2.openingSceneId,catalog.season.v2.endingSceneId,catalog.season.v2.hiddenEndingSceneId].filter(Boolean))if(!sceneIds.has(id!))throw new TowerRuleError('INVALID_SCENE','컷씬 참조를 확인하세요.');
      validateCondition(catalog.season.v2.hiddenCondition);
      for(const boss of catalog.season.v2.bosses)for(const reward of [...boss.firstRewards,...boss.repeatRewards])if(!await validateRewardTarget(reward.type,reward.targetId,tx))throw new TowerRuleError('INVALID_REWARD','보스 보상 대상을 확인하세요.');
    }
    for(const e of [...catalog.relics.flatMap(r=>r.effects??[]),...(catalog.season.v2?.bosses.flatMap(b=>b.abilities??[])??[])]){const ref=e.values.definitionRef as {id?:string;name?:string}|undefined;if(ref&&!cards.some(c=>c.status!=='DISABLED'&&(ref.id?c.id===ref.id:c.name===ref.name)))throw new TowerRuleError('INVALID_EFFECT','효과가 참조하는 카드가 존재하지 않습니다.');}
    // Include non-disabled token definitions for existing summon/transform effects;
    // eligibility is independently enforced for starters and rewards above.
    return { catalog, minionACardPool: completeMinionACatalog(cards),
      cards: cards.filter(card => card.status !== 'DISABLED').map(card => cardRecordToDefinition(card as unknown as Parameters<typeof cardRecordToDefinition>[0])),
      champions: champions.filter(champion => catalog.season.v2?champion.status!=='DISABLED':championIds.has(champion.id) || aiChampionIds.has(champion.id) || champion.id === TOWER_VANILLA_CHAMPION_ID).map(champion => championRecordToDefinition(champion as unknown as Parameters<typeof championRecordToDefinition>[0])),
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

function collectEffectTags(value:unknown):string[]{
 const tags=new Set<string>();function visit(x:unknown){if(Array.isArray(x)){x.forEach(visit);return;}if(!x||typeof x!=='object')return;for(const [key,v] of Object.entries(x)){if(['action','type','keyword','trigger','trackedEvent'].includes(key)&&typeof v==='string')tags.add(v);visit(v);}}visit(value);return [...tags];
}

function collectFilterTags(value:unknown):string[]{const tags=new Set<string>();function visit(x:unknown){if(Array.isArray(x)){x.forEach(visit);return;}if(!x||typeof x!=='object')return;for(const [k,v]of Object.entries(x)){if(['tag','tags'].includes(k)){if(typeof v==='string')tags.add(v);if(Array.isArray(v))v.filter((x):x is string=>typeof x==='string').forEach(x=>tags.add(x));}visit(v);}}visit(value);return [...tags];}

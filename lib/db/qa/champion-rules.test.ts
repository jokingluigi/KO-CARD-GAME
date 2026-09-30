import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { isStructuredEffects, isChampionQuestRewardEffects } from '../../../artifacts/api-server/src/lib/structured-effects';
import { championsTable, cardsTable } from '../src/schema';
import { championRecordToDefinition, type PublishedChampionRecord } from '../../../artifacts/ko-game/src/game/champions/published-champions';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { useChampionAbility } from '../../../artifacts/ko-game/src/game/engine/champion-system';
import { selectEffectTarget, applyEffect } from '../../../artifacts/ko-game/src/game/effects/effect-engine';
import { processChampionQuestEvents } from '../../../artifacts/ko-game/src/game/champions/quests';

test('persist existing champion settings, reload and execute both abilities and quests; restart preserves later edits', async () => {
  const pg = new PGlite(); const db = drizzle(pg);
  try {
    for (const ddl of await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ championsTable, cardsTable }))) await pg.exec(ddl);
    await db.insert(championsTable).values([
      { id: 'purple', name: '챔피언 퍼플레인', abilityName: 'Original purple', abilityCost: 2, abilityEffects: {}, imageUrl: 'portrait-purple', status: 'PUBLISHED' },
      { id: 'calavera', name: '챔피언 라 칼라베라', abilityName: 'Original calavera', abilityCost: 3, abilityEffects: {}, status: 'PUBLISHED' },
      { id: 'untouched', name: '챔피언 다른 캐릭터', abilityName: 'Unchanged', abilityEffects: {} },
    ]);
    await db.insert(cardsTable).values({ id: 'zombie', name: '좀비', cardType: 'WRESTLER', cost: 0, attack: 4, health: 5, text: 'old', isToken: true });
    const before = await db.select().from(championsTable);
    const migration = await readFile(new URL('../migrations/0029_champion_rules.sql', import.meta.url), 'utf8');
    await pg.exec(migration); await pg.exec(migration);
    const rows = await db.select().from(championsTable);
    assert.deepEqual(rows.find(r => r.id === 'untouched'), before.find(r => r.id === 'untouched'));
    assert.equal(rows.find(r => r.id === 'purple')?.imageUrl, 'portrait-purple');
    assert.equal(rows.find(r => r.id === 'calavera')?.abilityCost, 3);
    assert.equal(rows.find(r => r.id === 'purple')?.version, 2);
    assert.equal((await pg.query('SELECT * FROM ko_catalog_patch_backups')).rows.length, 3);
    assert.equal((await db.select().from(cardsTable))[0].cost, 1);
    for (const record of rows.filter(r => r.id !== 'untouched')) {
      assert.ok(isStructuredEffects(record.abilityEffects), record.id);
      assert.ok(isStructuredEffects(record.upgradedAbilityEffects));
      assert.ok(isChampionQuestRewardEffects(record.questRewardEffects));
    }
    const definitions = rows.map(r => championRecordToDefinition(r as PublishedChampionRecord));
    const state = createInitialGameState(['purple', 'calavera'], undefined, definitions);
    state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1'; state.players[0].currentGold = 10;
    const purple = useChampionAbility(state, 'player-1'); assert.ok(purple.success);
    const hit = processChampionQuestEvents(state, selectEffectTarget(purple.state, 'player-1'));
    assert.equal(hit.players[0].champion?.questProgress, 1);
    assert.equal(hit.players[0].health, state.players[0].health - 1);
    state.activePlayerId = 'player-2'; state.players[1].currentGold = 10;
    const calavera = useChampionAbility(state, 'player-2'); assert.ok(calavera.success);
    const zombie = calavera.state.players[1].board.find(c => c)!;
    assert.equal(zombie.currentAttack, 1); assert.equal(zombie.currentCost, 1);
    calavera.state.players[1].champion!.questProgress = 9;
    const retired = applyEffect(calavera.state, 'player-1', calavera.state.players[0].deck[0], {
      type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'BOARD', owner: 'ENEMY', selection: 'ALL', count: 4 }, values: { amount: 1 },
    });
    assert.equal(processChampionQuestEvents(calavera.state, retired).players[1].champion?.questCompleted, true);
    await pg.exec("UPDATE champions SET ability_text='later admin edit' WHERE id='purple'");
    await pg.exec(migration);
    assert.equal((await db.select().from(championsTable)).find(r => r.id === 'purple')?.abilityText, 'later admin edit');
  } finally { await pg.close(); }
});

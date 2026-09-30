import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { championsTable } from '../src/schema';
import { isStructuredEffects, isChampionQuestRewardEffects } from '../../../artifacts/api-server/src/lib/structured-effects';
import { championRecordToDefinition, type PublishedChampionRecord } from '../../../artifacts/ko-game/src/game/champions/published-champions';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { useChampionAbility } from '../../../artifacts/ko-game/src/game/engine/champion-system';
import { generateCardInstance } from '../../../artifacts/ko-game/src/game/cards/generation';
import type { CardDefinition } from '../../../artifacts/ko-game/src/game/cards/types';

const wrestler: CardDefinition = { id: 'wrestler', name: '선수', cardType: 'WRESTLER', cost: 2, attack: 2, health: 3, rulesText: '', isToken: false, isChampionToken: false, keywords: [], abilities: [] };
const technique: CardDefinition = { ...wrestler, id: 'technique', name: '주문', cardType: 'TECHNIQUE', attack: 0, health: 0 };
test('stored Pi Star Seven quest upgrades after five successful uses and buffs two distinct hand wrestlers for one gold', async () => {
  const pg = new PGlite(); const db = drizzle(pg);
  try {
    for (const ddl of await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ championsTable }))) await pg.exec(ddl);
    const base = { effects: [{ trigger: 'ACTIVE', action: 'BUFF', target: { zone: 'HAND', owner: 'SELF', cardType: 'WRESTLER', selection: 'RANDOM', count: 1 }, values: { attack: 1, health: 1 } }] };
    await db.insert(championsTable).values([
      { id: 'pi', name: '챔피언 피 스타 세븐', abilityName: '트레이닝', abilityCost: 1, abilityEffects: base, status: 'PUBLISHED', imageUrl: 'preserved' },
      { id: 'other', name: '다른 챔피언', abilityName: 'None', abilityEffects: {} },
    ]);
    const before = await db.select().from(championsTable);
    const migration = await readFile(new URL('../migrations/0030_pi-star-seven-quest.sql', import.meta.url), 'utf8');
    await pg.exec(migration); await pg.exec(migration);
    const rows = await db.select().from(championsTable); const record = rows.find(r => r.id === 'pi')!;
    assert.deepEqual(record.abilityEffects, base); assert.equal(record.abilityCost, 1); assert.equal(record.imageUrl, 'preserved');
    assert.equal(record.version, 2); assert.equal(record.questProgressRequired, 5); assert.equal(record.upgradedAbilityCost, 1);
    assert.ok(isStructuredEffects(record.upgradedAbilityEffects)); assert.ok(isChampionQuestRewardEffects(record.questRewardEffects));
    assert.deepEqual(rows.find(r => r.id === 'other'), before.find(r => r.id === 'other'));
    const definitions = rows.map(r => championRecordToDefinition(r as PublishedChampionRecord));
    let state = createInitialGameState(['pi', 'other'], [wrestler, technique], definitions);
    state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1';
    state.players[0].hand = Array.from({ length: 3 }, (_, i) => generateCardInstance(wrestler, { instanceId: `w-${i}` }));
    state.players[0].hand.push(generateCardInstance(technique, { instanceId: 't' }));
    for (let use = 1; use <= 5; use++) {
      state.players[0].currentGold = 5; state.players[0].championAbilityUsedThisTurn = false;
      const result = useChampionAbility(state, 'player-1'); assert.ok(result.success); state = result.state;
      assert.equal(state.players[0].champion?.questProgress, use); assert.equal(state.players[0].champion?.questCompleted, use === 5);
      const rejected = useChampionAbility(state, 'player-1'); assert.equal(rejected.success, false); assert.equal(rejected.state.players[0].champion?.questProgress, use);
    }
    assert.equal(state.events.filter(e => e.type === 'CHAMPION_QUEST_COMPLETED').length, 1);
    state.players[0].currentGold = 1; state.players[0].championAbilityUsedThisTurn = false;
    const hand = state.players[0].hand;
    const upgraded = useChampionAbility(state, 'player-1'); assert.ok(upgraded.success); state = upgraded.state;
    assert.equal(state.players[0].currentGold, 0);
    const changed = state.players[0].hand.filter((c, i) => c.currentAttack !== hand[i].currentAttack);
    assert.equal(changed.length, 2); assert.ok(changed.every(c => c.cardType === 'WRESTLER'));
    for (const c of changed) { const old = hand.find(x => x.instanceId === c.instanceId)!; assert.equal(c.currentAttack, old.currentAttack + 1); assert.equal(c.currentHealth, old.currentHealth + 1); }
    assert.deepEqual(state.players[0].hand.find(c => c.instanceId === 't'), hand.find(c => c.instanceId === 't'));
    for (const count of [0, 1]) {
      state.players[0].hand = [...Array.from({length: count}, (_, i) => generateCardInstance(wrestler, {instanceId:`edge-${i}`})), generateCardInstance(technique, {instanceId:'edge-spell'})];
      state.players[0].currentGold = 1; state.players[0].championAbilityUsedThisTurn = false;
      const edge = useChampionAbility(state, 'player-1'); assert.ok(edge.success); state = edge.state;
      assert.equal(state.players[0].hand.filter(c => c.cardType === 'WRESTLER' && c.currentAttack === 3).length, count);
      assert.equal(state.players[0].hand.find(c => c.cardType === 'TECHNIQUE')?.currentAttack, 0);
    }
    await pg.exec("UPDATE champions SET quest_text='later admin edit' WHERE id='pi'"); await pg.exec(migration);
    assert.equal((await db.select().from(championsTable)).find(r => r.id === 'pi')?.questText, 'later admin edit');
  } finally { await pg.close(); }
});

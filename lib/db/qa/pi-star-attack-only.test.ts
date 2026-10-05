import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cardRecordToDefinition, type PublishedCardRecord } from '../../../artifacts/ko-game/src/game/cards/published-cards';
import { generateCardInstance } from '../../../artifacts/ko-game/src/game/cards/generation';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { executeAction } from '../../../artifacts/ko-game/src/game/actions/engine-actions';

test('Pi Star repair preserves specs and description, buffs other allies attack only and applies once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE cards(id text PRIMARY KEY, name text, card_type text, cost integer, attack integer,
      health integer, text text, effect_id text, effect_config jsonb, version integer, updated_at timestamptz);
      INSERT INTO cards VALUES('5361339a-fd72-47e2-bbcb-f5a193a64ea3','피 스타 세븐','WRESTLER',4,3,5,
      '등장:자신을 제외한 필드에 나와있는 아군 선수들에게 공격력을 +2 부여합니다.',NULL,'{}',14,now());`);
    const before = (await db.query<any>('SELECT * FROM cards')).rows[0];
    const sql = await readFile(new URL('../migrations/0043_pi_star_attack_only.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const row = (await db.query<any>('SELECT * FROM cards')).rows[0];
    assert.deepEqual({ ...row, effect_id: before.effect_id, effect_config: before.effect_config,
      version: before.version, updated_at: before.updated_at }, before);
    assert.equal(row.version, 15);
    const definition = cardRecordToDefinition({ ...row, cardType: row.card_type, effectId: row.effect_id,
      effectConfig: row.effect_config, keywords: [], tags: [], isToken: false, isChampionToken: false } as PublishedCardRecord);
    const state = createInitialGameState(); state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1';
    state.cardPool = [definition]; state.players[0].currentGold = 10;
    const card = (instanceId: string) => generateCardInstance(definition, { instanceId });
    state.players[0].hand = [card('source')]; state.players[0].board = [null, { ...card('ally'), boardSlot: 1 }, null, null];
    state.players[1].board = [{ ...card('enemy'), boardSlot: 0 }, null, null, null];
    const result = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: 'source', boardSlot: 0 });
    assert.ok(result.success);
    const own = result.state.players[0].board;
    assert.deepEqual([own[0]!.currentAttack, own[0]!.currentHealth], [3, 5]);
    assert.deepEqual([own[1]!.currentAttack, own[1]!.currentHealth, own[1]!.maxHealth], [5, 5, 5]);
    assert.deepEqual([result.state.players[1].board[0]!.currentAttack, result.state.players[1].board[0]!.currentHealth], [3, 5]);
    assert.equal(result.state.players[0].currentGold, 6);
    assert.equal((await db.query('SELECT * FROM ko_catalog_patch_backups')).rows.length, 1);
  } finally { await db.close(); }
});

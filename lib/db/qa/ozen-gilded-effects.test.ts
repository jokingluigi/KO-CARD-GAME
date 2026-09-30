import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import {cardsTable} from '../src/schema';
import {isStructuredEffects} from '../../../artifacts/api-server/src/lib/structured-effects';
test('persist Ozen and hand-only gilded effects without changing original text, stats, media or publication status',async()=>{
 const pg=new PGlite();const db=drizzle(pg);try{
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson({cardsTable})))await pg.exec(ddl);
 const base={cardType:'WRESTLER',cost:2,attack:1,health:3,imageUrl:'keep',effectConfig:{},text:'original'};
 await db.insert(cardsTable).values([{...base,id:'ozen',name:'오젠',status:'DRAFT'},{...base,id:'master',name:'도금구슬 마스터',status:'DISABLED',text:'등장:내 손에 있는 6 비용 이상의 카드들의 비용을 전부 1 감소 시킵니다.'},{...base,id:'other',name:'다른 카드'}]);
 const before=await db.select().from(cardsTable);const sql=await readFile(new URL('../migrations/0032_ozen_gilded_effects.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
 const rows=await db.select().from(cardsTable);
 for(const id of ['ozen','master']){const a=rows.find(r=>r.id===id)!;const b=before.find(r=>r.id===id)!;assert.ok(isStructuredEffects(a.effectConfig));assert.equal(a.version,2);for(const k of ['text','status','cost','attack','health','imageUrl'] as const)assert.equal(a[k],b[k]);}
 assert.deepEqual((rows.find(r=>r.id==='master')!.effectConfig.effects as any[])[0].target.zones,['HAND']);
 assert.equal((rows.find(r=>r.id==='ozen')!.effectConfig.effects as any[])[0].target.filter.excludeChampionRarity,true);
 assert.deepEqual(rows.find(r=>r.id==='other'),before.find(r=>r.id==='other'));
 assert.equal((await pg.query('SELECT count(*) AS n FROM ko_catalog_patch_backups')).rows[0].n,2);
 await pg.exec("UPDATE cards SET effect_config='{}' WHERE id='ozen'");await pg.exec(sql);assert.deepEqual((await db.select().from(cardsTable)).find(r=>r.id==='ozen')!.effectConfig,{});
 }finally{await pg.close();}
});

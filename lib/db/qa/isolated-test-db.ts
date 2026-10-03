// Opt-in test preload; never opens a PostgreSQL network connection.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { after } from 'node:test';
import * as schema from '../src/schema';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
const pg=new PGlite();const database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await database.insert(schema.packDefinitionsTable).values({id:'qa-base-starter',name:'Isolated starter',starterRewardQuantity:1,status:'PUBLISHED'});
const {db,pool}=await import('../src/index');
for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
after(async()=>{await pg.close();await pool.end();});

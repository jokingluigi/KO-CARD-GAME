import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureKeepalive, keepaliveStatus, KEEPALIVE_JOB } from '../../artifacts/api-server/src/lib/render-keepalive.ts';

test('unsupported database rolls back before creating a scheduler or changing game data', async () => {
  const calls=[];
  const connection={async query(sql){calls.push(sql); return {rows:sql.includes('pg_available_extensions')?[{name:'pg_cron'}]:[]};}};
  await assert.rejects(configureKeepalive(connection,true), /SCHEDULER_UNAVAILABLE/);
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.ok(!calls.some(sql=>sql.startsWith('CREATE')));
});
test('registration has a fixed public destination, schedule and bounded private audit history', async()=>{
  const calls=[];
  const connection={async query(sql,values){calls.push({sql,values});return{rows:sql.includes('pg_available_extensions')?[{name:'pg_cron'},{name:'pg_net'}]:[]};}};
  await configureKeepalive(connection,true);
  const registration=calls.find(c=>c.sql.includes('cron.schedule'));
  assert.equal(registration.values[0],KEEPALIVE_JOB);
  assert.equal(registration.values[1],'*/5 * * * *');
  assert.match(registration.values[2],/https:\/\/ko-card-game.onrender.com\/api\/healthz/);
  assert.ok(!/authorization|password|secret|public\./i.test(registration.values[2]));
  assert.match(registration.values[2],/interval '1 day'/);
  assert.equal(calls.at(-1).sql,'COMMIT');
});
test('disable touches only the named monitor owned by the connected role', async()=>{
  const calls=[];
  const connection={async query(sql,values){calls.push({sql,values});return{rows:sql.includes('pg_extension')?[{}]:[]};}};
  await configureKeepalive(connection,false);
  const disable=calls.find(c=>c.sql.includes('cron.unschedule'));
  assert.deepEqual(disable.values,[KEEPALIVE_JOB]);
  assert.match(disable.sql,/username=current_user/);
  assert.ok(!calls.some(c=>/DROP|CREATE/.test(c.sql)));
});
test('configuration failure rolls back rather than leaving a partially installed monitor', async()=>{
  const calls=[];
  const connection={async query(sql){calls.push(sql);if(sql.startsWith('CREATE EXTENSION'))throw Error('permission denied');return{rows:sql.includes('pg_available_extensions')?[{},{}]:[]};}};
  await assert.rejects(configureKeepalive(connection,true), /permission denied/);
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.ok(!calls.some(sql=>sql.includes('cron.schedule')));
});
test('status works before extensions and private audit tables exist', async()=>{
  const connection={async query(sql){if(sql.includes('pg_available_extensions'))return{rows:[{name:'pg_cron',installed:null},{name:'pg_net',installed:null}]};if(sql.includes('to_regclass'))return{rows:[{requests:null,responses:null}]};throw Error('unexpected query');}};
  const status=await keepaliveStatus(connection);
  assert.equal(status.job,null);
  assert.deepEqual(status.requests,[]);
  assert.deepEqual(status.runs,[]);
});

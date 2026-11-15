import assert from 'node:assert/strict';
import {test} from 'node:test';
import {startTutorialFixture} from './tutorial-rewards-fixture.mjs';

test('only administrators can create a separate admin; credentials work and existing accounts stay intact', async () => {
  const fixture = await startTutorialFixture();
  const {origin,cookie,db,schema} = fixture;
  const before = await db.select().from(schema.usersTable);
  const {hashPassword, verifyPassword} = await import('../../artifacts/api-server/src/lib/auth.ts');
  const body = {email:' second-admin@example.invalid ',nickname:'추가 관리자',password:'Isolated-New-Admin-123',passwordConfirmation:'Isolated-New-Admin-123'};
  const create = (payload=body,session=cookie) => fetch(origin+'/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json',...(session?{cookie:session}:{})},body:JSON.stringify(payload)});
  try {
    assert.equal((await create(body,'')).status,401);
    await db.insert(schema.usersTable).values({id:'ordinary',email:'ordinary@example.invalid',nickname:'일반회원',passwordHash:await hashPassword(body.password)});
    const ordinary=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ordinary@example.invalid',password:body.password})});
    assert.equal(ordinary.status,200);
    assert.equal((await create(body,ordinary.headers.get('set-cookie').split(';')[0])).status,403);
    for (const invalid of [{email:'invalid'},{nickname:'x'},{password:'short',passwordConfirmation:'short'},{passwordConfirmation:'mismatch'}]) assert.equal((await create({...body,...invalid})).status,400);
    const created=await create();
    assert.equal(created.status,201);
    assert.match(created.headers.get('cache-control'),/no-store/);
    const result=await created.json();
    assert.equal(result.user.role,'ADMIN');
    assert.equal(result.user.email,'second-admin@example.invalid');
    assert.deepEqual(Object.keys(result.user).sort(),['email','id','nickname','role']);
    assert.equal((await create()).status,409);
    assert.equal((await create({...body,email:'third-admin@example.invalid'})).status,409);
    const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:result.user.email,password:body.password})});
    assert.equal(login.status,200);
    assert.equal((await login.json()).user.role,'ADMIN');
    const adminSession=await fetch(origin+'/api/admin/session',{headers:{cookie:login.headers.get('set-cookie').split(';')[0]}});
    assert.equal((await adminSession.json()).authenticated,true);
    const after=await db.select().from(schema.usersTable);
    const newUser=after.find(u=>u.id===result.user.id);
    assert.notEqual(newUser.passwordHash,body.password);
    assert.equal(await verifyPassword(body.password,newUser.passwordHash),true);
    for(const user of before) assert.deepEqual(after.find(u=>u.id===user.id),user);
    assert.equal(after.find(u=>u.id==='ordinary').role,'USER');
  } finally {await fixture.close();}
});

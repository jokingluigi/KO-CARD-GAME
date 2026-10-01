import assert from 'node:assert/strict';
import test from 'node:test';
import {createMaintenanceGate,MAINTENANCE_MESSAGE} from './maintenance';
test('maintenance blocks guests and ordinary sessions with explicit 503 while admin recovery stays available',async()=>{
 for(const enabled of [false,true])for(const role of [undefined,'USER','ADMIN']){
  const gate=createMaintenanceGate(async()=>({enabled,message:MAINTENANCE_MESSAGE}),async()=>role?{role} as never:null);
  for(const path of ['/cards','/online-matches','/admin/cards','/auth/register','/healthz','/auth/login','/auth/me']){
   let next=false,status=0,body:any;const response={setHeader(){},status(code:number){status=code;return this;},json(data:any){body=data;}};
   await gate({path} as never,response as never,()=>{next=true;});
   const allowed=!enabled||role==='ADMIN'||['/healthz','/auth/login','/auth/me'].includes(path);
   assert.equal(next,allowed,`${enabled} ${role} ${path}`);if(!allowed){assert.equal(status,503);assert.equal(body.code,'SERVER_MAINTENANCE');assert.match(body.message,/서버 점검/);}
  }
 }
});
test('maintenance store failure reaches error handling and does not grant access',async()=>{
 let failure:any;const gate=createMaintenanceGate(async()=>{throw Error('unavailable');});await gate({path:'/cards'} as never,{} as never,e=>{failure=e;});assert.match(failure.message,/unavailable/);
});

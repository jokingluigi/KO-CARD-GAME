import assert from 'node:assert/strict';
import test from 'node:test';
import {isMaintenanceBlocked} from './entry-state';
test('unresolved server status never blocks entry',()=>assert.equal(isMaintenanceBlocked(null),false));
test('maintenance is shown only after explicit denial',()=>{
 assert.equal(isMaintenanceBlocked({enabled:false,allowed:true,message:''}),false);
 assert.equal(isMaintenanceBlocked({enabled:true,allowed:true,message:'admin'}),false);
 assert.equal(isMaintenanceBlocked({enabled:true,allowed:false,message:'maintenance'}),true);
 assert.equal(isMaintenanceBlocked({enabled:false,allowed:false,message:''}),false);
});

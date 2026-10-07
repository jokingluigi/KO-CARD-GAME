import assert from 'node:assert/strict';
import {test} from 'node:test';
import {submitWithReceipt} from './reward-receipt';
test('successful submission does not consult receipt',async()=>{assert.equal(await submitWithReceipt(async()=>200,async()=>{assert.fail('unexpected lookup');return null;}),200);});
test('lost response recovers committed reward without another grant request',async()=>{let submissions=0;assert.deepEqual(await submitWithReceipt(async()=>{submissions++;throw new Error('network');},async()=>({amount:200})),{amount:200});assert.equal(submissions,1);});
test('missing receipt preserves original failure',async()=>{const original=new Error('rejected');await assert.rejects(submitWithReceipt(async()=>{throw original;},async()=>null),e=>e===original);});
test('failed receipt lookup preserves original failure',async()=>{const original=new Error('network');await assert.rejects(submitWithReceipt(async()=>{throw original;},async()=>{throw new Error('receipt offline');}),e=>e===original);});

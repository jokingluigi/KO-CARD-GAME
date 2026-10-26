import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPortrait,cachedPortrait} from './portrait-loading';
test('transient image failure retries the same portrait and shares pending work',async()=>{
 const previous=globalThis.Image;const requests:string[]=[];
 class Mock {
  naturalWidth=0;complete=false;decoding='';fetchPriority='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  set src(value:string){requests.push(value);setTimeout(()=>{if(!value.includes('ko_portrait_retry'))this.onerror?.();else{this.naturalWidth=100;this.onload?.();}},5);}
 }
 Object.defineProperty(globalThis,'Image',{configurable:true,value:Mock});
 try {
  const a=loadPortrait('/transient-retry.png',1500),b=loadPortrait('/transient-retry.png',1500);
  assert.equal(a,b);assert.equal(await a,'/transient-retry.png?ko_portrait_retry=1');
  assert.equal(requests.length,2);assert.equal(cachedPortrait('/transient-retry.png'),requests[1]);
 } finally {Object.defineProperty(globalThis,'Image',{configurable:true,value:previous});}
});
test('a timeout does not poison later requests for the identical URL',async()=>{
 const previous=globalThis.Image;let working=false;
 class Mock {
  naturalWidth=0;complete=false;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  set src(_value:string){if(working)setTimeout(()=>{this.naturalWidth=100;this.onload?.();},5);}
 }
 Object.defineProperty(globalThis,'Image',{configurable:true,value:Mock});
 try {
  assert.equal(await loadPortrait('/recover-after-timeout.png',15),null);
  working=true;assert.equal(await loadPortrait('/recover-after-timeout.png',100),'/recover-after-timeout.png');
 } finally {Object.defineProperty(globalThis,'Image',{configurable:true,value:previous});}
});

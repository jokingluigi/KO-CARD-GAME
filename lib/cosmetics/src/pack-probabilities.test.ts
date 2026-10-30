import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PACK_CATEGORIES,packCategory,packRateTotal,validPackRates} from './pack-probabilities';
const rates={normalRate:50,epicRate:15,legendaryRate:10,championRate:5,skinChance:12,emoteRate:8};
test('all 100 integer buckets exactly match the six published category percentages',()=>{
 const counts=new Map<string,number>();for(let i=0;i<100;i++){const c=packCategory(rates,i);counts.set(c,(counts.get(c)??0)+1);}
 for(const [category,key]of PACK_CATEGORIES)assert.equal(counts.get(category),rates[key]);assert.equal(packRateTotal(rates),100);
});
for(const [category,key]of PACK_CATEGORIES)test(`100% ${category}: no second skin roll or implicit champion fallback`,()=>{
 const p=Object.fromEntries(PACK_CATEGORIES.map(([,k])=>[k,k===key?100:0])) as typeof rates;
 for(let i=0;i<100;i++)assert.equal(packCategory(p,i),category);
});
test('old 100% grade sum plus skin is invalid rather than silently diluted or normalized',()=>{
 for(const p of [{...rates,normalRate:51},{...rates,skinChance:0},{...rates,emoteRate:-1},{...rates,skinChance:1.5}]){assert.equal(validPackRates(p),false);assert.throws(()=>packCategory(p,0));}
 for(const roll of [-1,100,1.5,NaN])assert.throws(()=>packCategory(rates,roll));
});

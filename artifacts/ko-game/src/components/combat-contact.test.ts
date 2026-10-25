import test from 'node:test';
import assert from 'node:assert/strict';
import {combatContact} from './combat-contact';
const rect=(left:number,top:number,width=100,height=140)=>({left,top,width,height});
test('vertical impact meets the near target edge without covering its centre',()=>{
 const c=combatContact(rect(0,400),rect(0,0));
 assert.equal(c.x,50);assert.equal(c.y,140);
 assert.ok(c.dy<0 && c.dy>-400+100);
 assert.equal(c.dx,0);
});
test('diagonal, reverse, champion-sized and zero-distance geometry stays finite',()=>{
 for(const target of [rect(250,0),rect(-250,800),rect(5,12,105,140),rect(0,400)]){
  const c=combatContact(rect(0,400),target);
  assert.ok(Object.values(c).every(Number.isFinite));
  assert.ok(c.x>=target.left-.001 && c.x<=target.left+target.width+.001);
  assert.ok(c.y>=target.top-.001 && c.y<=target.top+target.height+.001);
 }
});
test('viewport translation does not alter movement or introduce drift',()=>{
 const a=combatContact(rect(0,400),rect(250,0));
 const b=combatContact(rect(30,450),rect(280,50));
 assert.equal(a.dx,b.dx);assert.equal(a.dy,b.dy);
 assert.equal(b.x,a.x+30);assert.equal(b.y,a.y+50);
});

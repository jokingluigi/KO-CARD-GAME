import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native TypeScript runner needs the explicit extension.
import { getVisibleDeckOptionCards } from "./deck-options.ts";

const card = (overrides: Partial<{
  id: string;
  name: string;
  status: string;
  isToken: boolean;
  isChampionToken: boolean;
}> = {}) => ({
  id: "published-card",
  name: "Published card",
  status: "PUBLISHED",
  isToken: false,
  isChampionToken: false,
  ...overrides,
});

test("normal deck options include unowned published cards with quantity zero", () => {
  const cards = [card(), card({ id: "owned-card" })];
  const result = getVisibleDeckOptionCards(cards, [{ id: "owned-card", quantity: 2 }], false, -1);

  assert.deepEqual(
    result.map(({ id, quantity }) => ({ id, quantity })),
    [
      { id: "published-card", quantity: 0 },
      { id: "owned-card", quantity: 2 },
    ],
  );
});

test("deck options exclude unpublished and token definitions", () => {
  const result = getVisibleDeckOptionCards([
    card(),
    card({ id: "unpublished-card", status: "DRAFT" }),
    card({ id: "token", isToken: true }),
    card({ id: "champion-token", isChampionToken: true }),
  ], [], false, -1);

  assert.deepEqual(result.map(({ id }) => id), ["published-card"]);
});

test("test-account quantities remain unlimited", () => {
  const result = getVisibleDeckOptionCards([card()], [], true, 1_000_000_000);
  assert.equal(result[0]?.quantity, 1_000_000_000);
});
test("admin options include draft cards with unlimited quantity, excluding tokens and disabled cards", () => {
 const result=getVisibleDeckOptionCards([card(),card({id:'draft',status:'DRAFT'}),card({id:'disabled',status:'DISABLED'}),card({id:'token',status:'DRAFT',isToken:true})],[],true,999,true);
 assert.deepEqual(result.map(c=>[c.id,c.quantity]),[['published-card',999],['draft',999]]);
});

test('ordinary accounts see draft options only when they own positive quantities',()=>{
 const drafts=[card({id:'owned-draft',status:'DRAFT'}),card({id:'unowned-draft',status:'DRAFT'})];
 assert.deepEqual(getVisibleDeckOptionCards(drafts,[{id:'owned-draft',quantity:1}],false,999).map(c=>[c.id,c.quantity]),[['owned-draft',1]]);
 assert.equal(getVisibleDeckOptionCards(drafts,[],true,999).length,0);
});

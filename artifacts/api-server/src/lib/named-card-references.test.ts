import assert from 'node:assert/strict';
import test from 'node:test';
import { expandNamedCardReferences } from './named-card-references';

const source = { id: 'maid', name: '하녀 판도라', status: 'DRAFT', effectConfig: {
  effects: [{ action: 'TRANSFORM_SOURCE', values: { definitionRef: { name: '늑대인간' } } }],
} };

test('older name-only transformation loads a unique DRAFT form used by an AI deck', () => {
  const required = new Set(['maid']);
  expandNamedCardReferences([source, { id: 'wolf', name: '늑대인간 판도라', status: 'DRAFT', effectConfig: {} }], required);
  assert.deepEqual([...required], ['maid', 'wolf']);
});

test('ambiguous or disabled forms are never chosen by partial name', () => {
  const required = new Set(['maid']);
  expandNamedCardReferences([
    source,
    { id: 'wolf-a', name: '늑대인간 판도라', status: 'PUBLISHED', effectConfig: {} },
    { id: 'wolf-b', name: '늑대인간 블랙', status: 'DRAFT', effectConfig: {} },
  ], required);
  assert.deepEqual([...required], ['maid']);
  expandNamedCardReferences([
    source, { id: 'wolf', name: '늑대인간 판도라', status: 'DISABLED', effectConfig: {} },
  ], required);
  assert.deepEqual([...required], ['maid']);
});

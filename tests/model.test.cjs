const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const item = (extra = {}) => ({ id: 'one', categoryId: 'want', title: '海を見にいく', note: '', status: 'open', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', completedAt: null, metadata: { future: { vectorId: 'abc' } }, ...extra });
test('initial data has the four boxes and validates', () => {
  const data = M.initial(); assert.equal(M.validate(data), data); assert.deepEqual(data.categories.map(c => c.name), ['WANT', 'SAID', 'WORK', 'BASE']);
});
test('import rejects broken references, duplicate IDs, invalid dates and unknown schemas', () => {
  for (const badItem of [item({ categoryId: 'missing' }), item({ updatedAt: 'invalid' }), item({ title: ' ' }), item({ status: 'done' })]) {
    assert.throws(() => M.validate({ ...M.initial(), items: [badItem] }));
  }
  assert.throws(() => M.validate({ ...M.initial(), items: [item(), item()] }));
  assert.throws(() => M.validate({ ...M.initial(), schemaVersion: 2 }));
  assert.throws(() => M.validate({ ...M.initial(), categories: [] }));
});
test('merge keeps newer edits, unknown fields, and both sets without mutating input', () => {
  const a = { ...M.initial(), items: [item()] };
  const b = structuredClone(a); b.items[0].title = '海辺で朝ごはん'; b.items[0].updatedAt = '2026-02-01T00:00:00Z'; b.items[0].futureField = [1, 2]; b.items.push(item({ id: 'two' }));
  const merged = M.merge(a, b);
  assert.equal(merged.items.length, 2); assert.equal(merged.items[0].title, b.items[0].title); assert.deepEqual(merged.items[0].futureField, [1, 2]); assert.equal(merged.items[0].metadata.future.vectorId, 'abc'); assert.equal(a.items[0].title, '海を見にいく');
  assert.deepEqual(M.merge(merged, a), merged);
});
test('same-timestamp conflicts preserve current data', () => {
  const a = { ...M.initial(), items: [item()] }; const b = structuredClone(a); b.items[0].title = 'different'; assert.equal(M.merge(a, b).items[0].title, a.items[0].title);
});

test('pressure grows with age, clamps, and does not reset on edits', () => {
  const c = { ...M.initial().categories[0], settings: { pressure: true, basis: 'age', days: 10, motion: false, sort: 'pressure' } };
  const time = Date.parse('2026-01-06T00:00:00Z');
  assert.equal(M.pressure(item(), c, time), .5);
  assert.equal(M.pressure(item({ updatedAt: '2026-01-06T00:00:00Z' }), c, time), .5);
  assert.equal(M.pressure(item(), c, time + 100 * 86400000), 1);
  assert.equal(M.pressure(item(), c, time - 100 * 86400000), 0);
  assert.equal(M.pressure(item({ status: 'done' }), c, time), null);
  assert.equal(M.pressure(item(), M.initial().categories[0], time), null);
});
test('deadline pressure uses local calendar days and excludes undated items', () => {
  const c = { ...M.initial().categories[0], settings: { pressure: true, basis: 'deadline', days: 10, motion: false, sort: 'pressure' } };
  const time = new Date(2026, 0, 10, 23, 59).getTime();
  assert.equal(M.dueDays(item({ dueDate: '2026-01-10' }), time), 0);
  assert.equal(M.pressure(item({ dueDate: '2026-01-10' }), c, time), 1);
  assert.equal(M.pressure(item({ dueDate: '2026-01-15' }), c, time), .5);
  assert.equal(M.pressure(item(), c, time), null);
  const ordered = M.sortItems([item({ id: 'none' }), item({ id: 'later', dueDate: '2026-01-15' }), item({ id: 'today', dueDate: '2026-01-10' }), item({ id: 'overdue', dueDate: '2026-01-01' })], c, time);
  assert.deepEqual(ordered.map(i => i.id), ['overdue', 'today', 'later', 'none']);
});
test('rejects invalid optional settings/dates while accepting old backups', () => {
  assert.equal(M.validDue('2026-02-30'), false); assert.equal(M.validDue('2028-02-29'), true);
  assert.throws(() => M.validate({ ...M.initial(), items: [item({ dueDate: '2026-02-30' })] }));
  const data = M.initial(); data.categories[0].settings = { ...M.settings(data.categories[0]), days: 0 };
  assert.throws(() => M.validate(data));
  const old = { ...M.initial(), items: [item()] }; assert.equal(M.validate(old), old);
  const newer = structuredClone(old); newer.categories[0].settings = { ...M.settings(newer.categories[0]), pressure: true };
  newer.categories[0].updatedAt = '2099-01-01T00:00:00Z'; newer.items[0].dueDate = '2026-10-10'; newer.items[0].nextStep = '連絡する'; newer.items[0].updatedAt = '2099-01-01T00:00:00Z';
  assert.equal(M.merge(old, newer).categories[0].settings.pressure, true);
  assert.equal(M.merge(old, newer).items[0].nextStep, '連絡する');
});

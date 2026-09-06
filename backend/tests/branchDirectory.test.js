const test = require('node:test');
const assert = require('node:assert/strict');
const { createBranchDirectory } = require('../services/branchDirectory');

test('retries a lost database connection and returns active directory', async () => {
  let calls = 0;
  const rows = [{ slug: 'main' }];
  const list = createBranchDirectory(async () => {
    if (++calls === 1) throw Object.assign(new Error('lost'), { code: 'ECONNRESET' });
    return rows;
  }, async () => {});
  assert.deepEqual(await list(), rows);
  assert.equal(calls, 2);
});
test('shares concurrent requests and refreshes on the next call', async () => {
  let calls = 0;
  const list = createBranchDirectory(async () => { calls++; return []; });
  await Promise.all([list(), list(), list()]);
  assert.equal(calls, 1);
  await list();
  assert.equal(calls, 2);
});
test('does not retry schema errors and recovers after a failed request', async () => {
  let calls = 0;
  const list = createBranchDirectory(async () => {
    if (++calls === 1) throw Object.assign(new Error('schema'), { code: 'ER_BAD_FIELD_ERROR' });
    return [];
  });
  await assert.rejects(list(), { code: 'ER_BAD_FIELD_ERROR' });
  assert.equal(calls, 1);
  assert.deepEqual(await list(), []);
});
test('stops after one retry when the database remains unavailable', async () => {
  let calls = 0;
  const list = createBranchDirectory(async () => {
    calls++;
    throw Object.assign(new Error('offline'), { code: 'ECONNREFUSED' });
  }, async () => {});
  await assert.rejects(list(), { code: 'ECONNREFUSED' });
  assert.equal(calls, 2);
});

const TRANSIENT_ERRORS = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_TOO_MANY_USER_CONNECTIONS'
]);

// Only retry this idempotent read. Never retry writes or authentication side effects.
function createBranchDirectory(query, delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))) {
  let pending;
  return function listBranches() {
    if (pending) return pending;
    pending = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await query(`
            SELECT bb.slug, bb.name, bb.business_id, b.name AS business_name
            FROM business_branches bb
            JOIN businesses b ON b.id = bb.business_id
            WHERE bb.is_active = 1 AND b.is_active = 1
            ORDER BY b.name ASC, bb.name ASC
          `);
        } catch (error) {
          if (attempt || !TRANSIENT_ERRORS.has(error.code)) throw error;
          await delay(200);
        }
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createBranchDirectory, TRANSIENT_ERRORS };

// Concurrent-index SQL for email_log. Before this PR nothing ever pruned this
// table, so on the first deploy that ships the retention sweep it is likely
// the largest of the three newly-swept tables; a transactional CREATE INDEX
// would hold an ACCESS EXCLUSIVE lock for the whole scan and stall every
// fire-and-forget recordEmailLog write (plus queue up pool connections behind
// realm boot). The age index therefore goes through the post-commit
// CONCURRENTLY seam (server/concurrent_indexes.ts), never boot DDL. Constants
// live in this dependency-free module for the same reason as
// client_perf_indexes.ts: the registry evaluates its list at import time and
// server/db.ts already imports the registry. db.ts re-exports them.

// email_log_account (defined inline in the schema) leads on account_id, so it
// cannot serve pruneEmailLogBatch's account-agnostic age scan; this plain
// sent_at index is the one that does.
export const EMAIL_LOG_SENT_INDEX_SQL = `
CREATE INDEX CONCURRENTLY IF NOT EXISTS email_log_sent
  ON email_log(sent_at);
`;

// A CREATE INDEX CONCURRENTLY killed mid-build strands the index INVALID and
// IF NOT EXISTS then treats it as existing on every later boot (the
// player_metrics_db.ts carcass note); the boot coordinator drops the carcass
// before re-running the create.
export const EMAIL_LOG_SENT_INVALID_INDEX_CHECK_SQL = `
SELECT 1
  FROM pg_index i
 WHERE i.indexrelid = to_regclass('email_log_sent')
   AND NOT i.indisvalid
`;

export const EMAIL_LOG_SENT_INVALID_INDEX_DROP_SQL =
  'DROP INDEX CONCURRENTLY IF EXISTS email_log_sent';

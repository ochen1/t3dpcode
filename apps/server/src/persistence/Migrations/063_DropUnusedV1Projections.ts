import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Keep threads, messages, fork-imported tool activities, and PR links for V1 transcript imports.
// Older builds read state.sqlite, so dropping unused projections here preserves rollback.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The fork still imports tool history from this table on demand.
  yield* sql`DROP TABLE IF EXISTS projection_turns`;
  yield* sql`DROP TABLE IF EXISTS projection_thread_proposed_plans`;
  yield* sql`DROP TABLE IF EXISTS projection_pending_approvals`;
  yield* sql`DROP TABLE IF EXISTS projection_state`;
  yield* sql`DROP TABLE IF EXISTS checkpoint_diff_blobs`;
});

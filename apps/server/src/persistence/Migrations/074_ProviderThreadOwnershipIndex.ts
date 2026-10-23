import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Ownership discovery needs node IDs without loading historical tool-output pages.
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_nodes_thread_id_idx
    ON orchestration_v2_projection_nodes(thread_id, node_id)
  `;
});

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Snapshot windows filter metadata without reading historical tool and checkpoint payloads.
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_provider_turns_window_idx
    ON orchestration_v2_projection_provider_turns(thread_id, status, node_id, provider_turn_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_checkpoints_window_idx
    ON orchestration_v2_projection_checkpoints(thread_id, status, run_id, node_id, checkpoint_id)
  `;
});

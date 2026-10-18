import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Filter control records before fetching payloads, which can contain large tool output.
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_nodes_control_idx
    ON orchestration_v2_projection_nodes(thread_id, kind, status, run_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_turn_items_thread_type_idx
    ON orchestration_v2_projection_turn_items(thread_id, type, ordinal, turn_item_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_turn_items_message_order_idx
    ON orchestration_v2_projection_turn_items(thread_id, json_extract(payload_json, '$.messageId'), ordinal)
    WHERE type IN ('user_message', 'assistant_message')
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_turn_items_waiting_secret_idx
    ON orchestration_v2_projection_turn_items(thread_id, run_id, updated_at DESC, turn_item_id DESC)
    WHERE type = 'secret_request' AND status = 'waiting'
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_messages_latest_user_authored_idx
    ON orchestration_v2_projection_messages(thread_id, updated_at DESC, message_id DESC)
    WHERE role = 'user' AND json_extract(payload_json, '$.createdBy') = 'user'
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_runs_activity_idx
    ON orchestration_v2_projection_runs(thread_id, status, ordinal DESC, run_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_runs_executed_idx
    ON orchestration_v2_projection_runs(thread_id, (completed_at IS NULL) DESC,
      completed_at DESC, ordinal DESC, run_id DESC)
    WHERE status <> 'queued'
      AND NOT (status = 'cancelled' AND json_extract(payload_json, '$.startedAt') IS NULL)
  `;
});

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE projection_thread_sessions
    SET provider_thread_id = (
      SELECT json_extract(runtime.resume_cursor_json, '$.threadId')
      FROM provider_session_runtime AS runtime
      WHERE runtime.thread_id = projection_thread_sessions.thread_id
        AND runtime.provider_name = 'codex'
        AND json_valid(runtime.resume_cursor_json)
        AND json_type(runtime.resume_cursor_json, '$.threadId') = 'text'
        AND json_extract(runtime.resume_cursor_json, '$.threadId') <> ''
        AND json_extract(runtime.resume_cursor_json, '$.threadId') NOT GLOB '*[^A-Za-z0-9_-]*'
    )
    WHERE provider_name = 'codex'
      AND provider_thread_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM provider_session_runtime AS runtime
        WHERE runtime.thread_id = projection_thread_sessions.thread_id
          AND runtime.provider_name = 'codex'
          AND json_valid(runtime.resume_cursor_json)
          AND json_type(runtime.resume_cursor_json, '$.threadId') = 'text'
          AND json_extract(runtime.resume_cursor_json, '$.threadId') <> ''
          AND json_extract(runtime.resume_cursor_json, '$.threadId') NOT GLOB '*[^A-Za-z0-9_-]*'
      )
  `;
});

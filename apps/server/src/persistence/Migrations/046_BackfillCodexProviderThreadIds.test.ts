import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("046_BackfillCodexProviderThreadIds", (it) => {
  it.effect("backfills safe Codex thread ids without overwriting existing values", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 39 });

      yield* sql`
        INSERT INTO projection_thread_sessions (
          thread_id, status, provider_name, provider_thread_id, runtime_mode,
          active_turn_id, last_error, updated_at
        ) VALUES
          ('thread-backfill', 'ready', 'codex', NULL, 'full-access', NULL, NULL, '2026-08-06T00:00:00.000Z'),
          ('thread-preserve', 'ready', 'codex', 'existing-id', 'full-access', NULL, NULL, '2026-08-06T00:00:00.000Z'),
          ('thread-unsafe', 'ready', 'codex', NULL, 'full-access', NULL, NULL, '2026-08-06T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO provider_session_runtime (
          thread_id, provider_name, adapter_key, runtime_mode, status, last_seen_at,
          resume_cursor_json, runtime_payload_json
        ) VALUES
          ('thread-backfill', 'codex', 'codex', 'full-access', 'ready', '2026-08-06T00:00:00.000Z', '{"threadId":"019cea39-5785-7f21-b9c0-140c828cf0e5"}', NULL),
          ('thread-preserve', 'codex', 'codex', 'full-access', 'ready', '2026-08-06T00:00:00.000Z', '{"threadId":"replacement-id"}', NULL),
          ('thread-unsafe', 'codex', 'codex', 'full-access', 'ready', '2026-08-06T00:00:00.000Z', '{"threadId":"unsafe;command"}', NULL)
      `;

      yield* runMigrations({ toMigrationInclusive: 46 });
      const rows = yield* sql<{
        readonly threadId: string;
        readonly providerThreadId: string | null;
      }>`
        SELECT thread_id AS "threadId", provider_thread_id AS "providerThreadId"
        FROM projection_thread_sessions
        ORDER BY thread_id
      `;

      assert.deepEqual(rows, [
        { threadId: "thread-backfill", providerThreadId: "019cea39-5785-7f21-b9c0-140c828cf0e5" },
        { threadId: "thread-preserve", providerThreadId: "existing-id" },
        { threadId: "thread-unsafe", providerThreadId: null },
      ]);
    }),
  );
});

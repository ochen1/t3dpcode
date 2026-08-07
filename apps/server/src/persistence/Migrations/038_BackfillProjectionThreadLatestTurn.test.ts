import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("038_BackfillProjectionThreadLatestTurn", (it) => {
  it.effect("restores missing latest turn links without overwriting existing links", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          archived_at,
          latest_user_message_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan,
          deleted_at
        )
        VALUES
          (
            'thread-backfill',
            'project-1',
            'Backfill me',
            '{"provider":"codex","model":"gpt-5-codex"}',
            'full-access',
            'default',
            NULL,
            NULL,
            NULL,
            '2026-02-24T00:00:00.000Z',
            '2026-02-24T00:10:00.000Z',
            NULL,
            NULL,
            0,
            0,
            0,
            NULL
          ),
          (
            'thread-preserve',
            'project-1',
            'Preserve me',
            '{"provider":"codex","model":"gpt-5-codex"}',
            'full-access',
            'default',
            NULL,
            NULL,
            'turn-preserved',
            '2026-02-24T00:00:00.000Z',
            '2026-02-24T00:10:00.000Z',
            NULL,
            NULL,
            0,
            0,
            0,
            NULL
          ),
          (
            'thread-empty',
            'project-1',
            'No turns',
            '{"provider":"codex","model":"gpt-5-codex"}',
            'full-access',
            'default',
            NULL,
            NULL,
            NULL,
            '2026-02-24T00:00:00.000Z',
            '2026-02-24T00:10:00.000Z',
            NULL,
            NULL,
            0,
            0,
            0,
            NULL
          )
      `;

      yield* sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          pending_message_id,
          assistant_message_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_turn_count,
          checkpoint_ref,
          checkpoint_status,
          checkpoint_files_json,
          source_proposed_plan_thread_id,
          source_proposed_plan_id
        )
        VALUES
          (
            'thread-backfill',
            'turn-old',
            NULL,
            NULL,
            'completed',
            '2026-02-24T00:01:00.000Z',
            '2026-02-24T00:01:00.000Z',
            '2026-02-24T00:02:00.000Z',
            NULL,
            NULL,
            NULL,
            '[]',
            NULL,
            NULL
          ),
          (
            'thread-backfill',
            'turn-new',
            NULL,
            NULL,
            'completed',
            '2026-02-24T00:05:00.000Z',
            '2026-02-24T00:05:00.000Z',
            '2026-02-24T00:06:00.000Z',
            NULL,
            NULL,
            NULL,
            '[]',
            NULL,
            NULL
          ),
          (
            'thread-preserve',
            'turn-preserved',
            NULL,
            NULL,
            'completed',
            '2026-02-24T00:03:00.000Z',
            '2026-02-24T00:03:00.000Z',
            '2026-02-24T00:04:00.000Z',
            NULL,
            NULL,
            NULL,
            '[]',
            NULL,
            NULL
          ),
          (
            'thread-preserve',
            'turn-newer-but-not-linked',
            NULL,
            NULL,
            'completed',
            '2026-02-24T00:07:00.000Z',
            '2026-02-24T00:07:00.000Z',
            '2026-02-24T00:08:00.000Z',
            NULL,
            NULL,
            NULL,
            '[]',
            NULL,
            NULL
          )
      `;

      yield* runMigrations({ toMigrationInclusive: 37 });

      const rows = yield* sql<{
        readonly threadId: string;
        readonly latestTurnId: string | null;
      }>`
        SELECT
          thread_id AS "threadId",
          latest_turn_id AS "latestTurnId"
        FROM projection_threads
        ORDER BY thread_id ASC
      `;

      assert.deepStrictEqual(rows, [
        { threadId: "thread-backfill", latestTurnId: "turn-new" },
        { threadId: "thread-empty", latestTurnId: null },
        { threadId: "thread-preserve", latestTurnId: "turn-preserved" },
      ]);
    }),
  );
});

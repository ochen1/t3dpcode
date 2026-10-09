import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";
import { migrationManifest, runMigrations } from "./Migrations.ts";
import ForkRepair from "./Migrations/054_RepairForkMigrationCollisions.ts";
import ForkLatestTurn from "./Migrations/055_BackfillProjectionThreadLatestTurn.ts";
import ForkQueue from "./Migrations/056_ProjectionQueuedTurns.ts";
import ForkClaude from "./Migrations/057_BackfillClaudeProviderThreadIds.ts";
import ForkCodex from "./Migrations/058_BackfillCodexProviderThreadIds.ts";
import ForkPush from "./Migrations/059_SelfHostedPushDevices.ts";
import ViewedFiles from "./Migrations/053_PullRequestFilesViewed.ts";

const seedFork = Effect.gen(function* () {
  yield* runMigrations({ toMigrationInclusive: 53 });
  yield* Migrator.make({})({
    loader: Migrator.fromRecord({
      "54_RepairForkMigrationCollisions": ForkRepair,
      "55_BackfillProjectionThreadLatestTurn": ForkLatestTurn,
      "56_ProjectionQueuedTurns": ForkQueue,
      "57_BackfillClaudeProviderThreadIds": ForkClaude,
      "58_BackfillCodexProviderThreadIds": ForkCodex,
      "59_SelfHostedPushDevices": ForkPush,
      "60_EnsurePullRequestFilesViewed": ViewedFiles,
    }),
  });
});

describe("fork database upgrade", () => {
  it.effect("runs V2 setup, preserves fork data and ledger, and can restart", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      const oldHistory =
        yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id >= 54 ORDER BY migration_id`;
      yield* sql`INSERT INTO self_hosted_push_devices VALUES ('phone', 'ExponentPushToken[token]', 'Phone', '2026-10-06')`;
      yield* sql`INSERT INTO projection_queued_turns (queued_turn_id, thread_id, message_id, text, attachments_json, runtime_mode, interaction_mode, created_at, updated_at)
      VALUES ('queue', 'thread', 'message', 'follow up', '[]', 'full-access', 'default', '2026-10-06', '2026-10-06')`;
      yield* runMigrations();
      assert.deepEqual(
        (yield* sql<{
          readonly migration_id: number;
          readonly name: string;
        }>`SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id`).map(
          (row) => [row.migration_id, row.name] as const,
        ),
        migrationManifest,
      );
      assert.deepEqual(
        yield* sql`SELECT * FROM t3_fork_migration_history ORDER BY migration_id`,
        oldHistory,
      );
      assert.equal((yield* sql`SELECT * FROM self_hosted_push_devices`).length, 1);
      assert.equal((yield* sql`SELECT * FROM projection_queued_turns`).length, 1);
      assert.equal(
        (yield* sql`SELECT name FROM sqlite_master WHERE name = 'orchestration_v2_projection_threads'`)
          .length,
        1,
      );
      assert.deepEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("upgrades the V2 fork's push migration without losing registered devices", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 58 });
      yield* Migrator.make({})({
        loader: Migrator.fromRecord({ "59_SelfHostedPushDevices": ForkPush }),
      });
      yield* sql`INSERT INTO self_hosted_push_devices VALUES ('phone', 'ExponentPushToken[token]', 'Phone', '2026-10-09')`;
      const pushHistory = yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id = 59`;
      assert.deepEqual(yield* runMigrations(), [
        [59, "McpAppModelContext"],
        [60, "ThreadSnapshotWindowIndexes"],
        [61, "SelfHostedPushDevices"],
      ]);
      assert.deepEqual(yield* sql`SELECT * FROM t3_fork_migration_history`, pushHistory);
      assert.equal((yield* sql`SELECT * FROM self_hosted_push_devices`).length, 1);
      assert.deepEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'mcp_app_model_context'`,
        [{ name: "mcp_app_model_context" }],
      );
      assert.deepEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("does not rewrite an unknown migration history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedFork;
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (61, 'UnknownMigration')`;
      const history = yield* sql`SELECT * FROM effect_sql_migrations`;
      const exit = yield* Effect.exit(runMigrations());
      assert.isTrue(Exit.isFailure(exit));
      assert.deepEqual(yield* sql`SELECT * FROM effect_sql_migrations`, history);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});

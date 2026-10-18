import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

const FORK_MIGRATIONS = new Map([
  [54, "RepairForkMigrationCollisions"],
  [55, "BackfillProjectionThreadLatestTurn"],
  [56, "ProjectionQueuedTurns"],
  [57, "BackfillClaudeProviderThreadIds"],
  [58, "BackfillCodexProviderThreadIds"],
  [59, "SelfHostedPushDevices"],
  [60, "EnsurePullRequestFilesViewed"],
]);

/** Preserve the fork ledger separately so its shared IDs cannot skip V2 setup. */
export const reconcileForkMigrations = Effect.fn("reconcileForkMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables =
        yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'`;
      if (tables.length === 0) return;
      const rows = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 54`;
      // Replay the colliding fork tail after upstream's migration 63. Its
      // indexes and push table are idempotent, so existing data stays in place.
      if (rows.some((row) => row.migration_id === 63 && row.name === "SelfHostedPushDevices")) {
        const forkTail = new Map([
          [63, "SelfHostedPushDevices"],
          [64, "RuntimeRecoveryReadIndexes"],
          [65, "InteractiveProjectionIndexes"],
        ]);
        if (
          !rows
            .filter((row) => row.migration_id >= 63)
            .every((row) => forkTail.get(row.migration_id) === row.name)
        ) {
          return yield* new Migrator.MigrationError({
            kind: "BadState",
            message: "Cannot reconcile fork migration IDs with an unrecognized later migration.",
          });
        }
        yield* sql`CREATE TABLE IF NOT EXISTS t3_fork_migration_history (migration_id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`;
        yield* sql`INSERT OR IGNORE INTO t3_fork_migration_history (migration_id, name, created_at) SELECT migration_id, name, created_at FROM effect_sql_migrations WHERE migration_id >= 63`;
        yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id >= 63`;
        return;
      }
      // The V2 fork shipped push devices at 59 and 61, now used by upstream.
      // Archive those entries so upstream migrations run before push devices at 66.
      if (
        rows.some(
          (row) =>
            (row.migration_id === 59 || row.migration_id === 61) &&
            row.name === "SelfHostedPushDevices",
        ) &&
        rows.every(
          (row) =>
            (row.migration_id === 54 && row.name === "ProjectionThreadsAutoSettleDisabledAt") ||
            (row.migration_id === 55 && row.name === "OrchestrationV2") ||
            (row.migration_id === 56 && row.name === "RemoveRedundantProjectionIndexes") ||
            (row.migration_id === 57 && row.name === "ScheduledTaskWebhooks") ||
            (row.migration_id === 58 && row.name === "WebhookRelayDeliveries") ||
            (row.migration_id === 59 &&
              (row.name === "SelfHostedPushDevices" || row.name === "McpAppModelContext")) ||
            (row.migration_id === 60 && row.name === "ThreadSnapshotWindowIndexes") ||
            (row.migration_id === 61 && row.name === "SelfHostedPushDevices"),
        )
      ) {
        yield* sql`CREATE TABLE IF NOT EXISTS t3_fork_migration_history (migration_id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`;
        yield* sql`INSERT OR IGNORE INTO t3_fork_migration_history (migration_id, name, created_at) SELECT migration_id, name, created_at FROM effect_sql_migrations WHERE migration_id IN (59, 61) AND name = 'SelfHostedPushDevices'`;
        yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id IN (59, 61) AND name = 'SelfHostedPushDevices'`;
        return;
      }
      if (
        !rows.some(
          (row) => row.migration_id !== 59 && FORK_MIGRATIONS.get(row.migration_id) === row.name,
        )
      )
        return;
      if (!rows.every((row) => FORK_MIGRATIONS.get(row.migration_id) === row.name)) {
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: "Cannot reconcile fork migration IDs with an unrecognized later migration.",
        });
      }
      yield* sql`CREATE TABLE IF NOT EXISTS t3_fork_migration_history (migration_id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`;
      yield* sql`INSERT INTO t3_fork_migration_history (migration_id, name, created_at) SELECT migration_id, name, created_at FROM effect_sql_migrations WHERE migration_id >= 54`;
      yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id >= 54`;
    }),
  );
});

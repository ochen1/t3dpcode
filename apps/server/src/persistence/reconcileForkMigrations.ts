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

import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("054_RepairForkMigrationCollisions", (it) => {
  it.effect("applies upstream schema changes skipped by reused fork migration ids", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 47 });

      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (48, 'ForkMigration48'),
          (49, 'ForkMigration49'),
          (50, 'ForkMigration50'),
          (51, 'ForkMigration51'),
          (52, 'ForkMigration52')
      `;

      yield* runMigrations({ toMigrationInclusive: 54 });

      const threadColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const messageColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_thread_messages)
      `;
      const pullRequestTables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'projection_thread_pull_requests'
      `;

      assert.equal(
        threadColumns.some((column) => column.name === "branch_pull_request_json"),
        true,
      );
      assert.equal(
        threadColumns.some((column) => column.name === "active_order_key"),
        true,
      );
      assert.equal(
        threadColumns.some((column) => column.name === "title_state_json"),
        true,
      );
      assert.equal(
        messageColumns.some((column) => column.name === "context_json"),
        true,
      );
      assert.equal(pullRequestTables.length, 1);
    }),
  );
});

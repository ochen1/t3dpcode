import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("053_RepairForkMigrationCollisions", (it) => {
  it.effect("applies upstream schema changes skipped by reused fork migration ids", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 42 });

      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (43, 'ForkMigration43'),
          (44, 'ForkMigration44'),
          (45, 'ForkMigration45'),
          (46, 'ForkMigration46'),
          (47, 'ForkMigration47'),
          (48, 'ForkMigration48'),
          (49, 'ForkMigration49'),
          (50, 'ForkMigration50'),
          (51, 'ForkMigration51'),
          (52, 'ForkMigration52')
      `;

      yield* runMigrations({ toMigrationInclusive: 53 });

      const projectColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_projects)
      `;
      const threadColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;

      assert.equal(
        projectColumns.some((column) => column.name === "auto_pull"),
        true,
      );
      assert.equal(
        projectColumns.some((column) => column.name === "project_icon_json"),
        true,
      );
      assert.equal(
        threadColumns.some((column) => column.name === "unsettled_at"),
        true,
      );
    }),
  );
});

import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })))(
  "fork migration upgrade",
  (it) => {
    it.effect("creates viewed files for a fork already migrated through 59", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 59 });
        // Reproduce the prior fork schema: migration 53 never ran.
        yield* sql`DROP TABLE pull_request_files_viewed`;
        yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id = 53`;
        yield* runMigrations();
        yield* sql`INSERT INTO pull_request_files_viewed
        (provider, host, repository, number, viewer, path, viewed_at)
        VALUES ('github', 'github.com', 'owner/repo', 1, 'viewer', 'file.ts', '2026-09-21')`;
        const rows = yield* sql`SELECT * FROM pull_request_files_viewed`;
        assert.equal(rows.length, 1);
        assert.deepEqual(yield* runMigrations(), []);
      }),
    );
  },
);

it.effect("also migrates fresh databases", () =>
  Effect.gen(function* () {
    yield* runMigrations();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql`SELECT * FROM pull_request_files_viewed`;
    assert.equal(rows.length, 0);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import ProjectionThreadBranchPullRequest from "./048_ProjectionThreadBranchPullRequest.ts";
import ProjectionThreadsActiveOrderKey from "./049_ProjectionThreadsActiveOrderKey.ts";
import ProjectionThreadPullRequests from "./050_ProjectionThreadPullRequests.ts";
import ProjectionThreadMessageContext from "./051_ProjectionThreadMessageContext.ts";
import ProjectionThreadTitleState from "./052_ProjectionThreadTitleState.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const migrations = yield* sql<{ readonly migrationId: number; readonly name: string }>`
    SELECT migration_id AS "migrationId", name
    FROM effect_sql_migrations
    WHERE migration_id BETWEEN 48 AND 52
  `;
  const applied = new Map(migrations.map(({ migrationId, name }) => [migrationId, name]));

  if (applied.get(48) !== "ProjectionThreadBranchPullRequest") {
    yield* ProjectionThreadBranchPullRequest;
  }
  if (applied.get(49) !== "ProjectionThreadsActiveOrderKey") {
    yield* ProjectionThreadsActiveOrderKey;
  }
  if (applied.get(50) !== "ProjectionThreadPullRequests") {
    yield* ProjectionThreadPullRequests;
  }
  if (applied.get(51) !== "ProjectionThreadMessageContext") {
    yield* ProjectionThreadMessageContext;
  }
  if (applied.get(52) !== "ProjectionThreadTitleState") {
    yield* ProjectionThreadTitleState;
  }
});

import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import ForkQueue from "../persistence/Migrations/056_ProjectionQueuedTurns.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import { OrchestratorV2 } from "../orchestration-v2/Orchestrator.ts";
import type { ProviderAdapterV2Shape } from "../orchestration-v2/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import { importForkQueuedTurns } from "./importForkQueuedTurns.ts";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Queue migration must not start a provider"),
} as ProviderAdapterV2Shape;
const database = SqlitePersistence.layerMemory;
const layer = Layer.mergeAll(
  database,
  ProviderReplayHarness.layerWithRegistry(
    { name: "fork-queue-import" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: database, runEffectWorker: false },
  ),
);

it.effect("restores fork queues as held V2 runs, in order, without duplicates", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const orchestrator = yield* OrchestratorV2;
    const threadId = ThreadId.make("thread:fork-queue");
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make("fork-queue-create"),
      threadId,
      projectId: ProjectId.make("project:fork-queue"),
      title: "Queue",
      modelSelection: { instanceId, model: "gpt-5.1-codex" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "server",
    });
    yield* ForkQueue;
    for (const index of [1, 2])
      yield* sql`INSERT INTO projection_queued_turns
    (queued_turn_id, thread_id, message_id, text, attachments_json, runtime_mode, interaction_mode, created_at, updated_at)
    VALUES (${`q-${index}`}, ${threadId}, ${`msg-${index}`}, ${`Follow up ${index}`}, '[]', 'full-access', 'default', ${`2026-10-06T12:00:0${index}.000Z`}, '2026-10-06')`;
    yield* importForkQueuedTurns(orchestrator);
    const projection = yield* orchestrator.getThreadRecords(threadId, ["runs", "messages"]);
    assert.deepEqual(
      projection.runs.map((run) => [run.status, run.queueHeld, run.queuePosition]),
      [
        ["queued", true, 1],
        ["queued", true, 2],
      ],
    );
    assert.deepEqual(
      projection.messages.map((message) => message.text),
      ["Follow up 1", "Follow up 2"],
    );
    assert.equal((yield* sql`SELECT * FROM projection_queued_turns`).length, 0);
    yield* importForkQueuedTurns(orchestrator);
    assert.equal((yield* orchestrator.getThreadRecords(threadId, ["runs"])).runs.length, 2);
    yield* orchestrator.dispatch({
      type: "queue.resume",
      threadId,
      commandId: CommandId.make("resume-imported-queue"),
    });
    const resumed = yield* orchestrator.getThreadRecords(threadId, ["runs"]);
    assert.isTrue(resumed.runs.some((run) => run.status !== "queued"));
  }).pipe(Effect.provide(layer)),
);

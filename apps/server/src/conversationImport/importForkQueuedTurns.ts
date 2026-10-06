import {
  ChatAttachment,
  CommandId,
  EventId,
  MessageId,
  ModelSelection,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { LegacyV1ThreadImporter } from "../orchestration-v2/legacy/LegacyV1ThreadImporter.ts";
import { EventSinkV2 } from "../orchestration-v2/EventSink.ts";
import type { OrchestratorV2 } from "../orchestration-v2/Orchestrator.ts";

const decodeAttachments = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(ChatAttachment)),
);
const decodeModel = Schema.decodeUnknownEffect(Schema.fromJsonString(ModelSelection));

/** Restores persisted fork queues before recovery and provider workers start. */
export const importForkQueuedTurns = Effect.fn("importForkQueuedTurns")(function* (
  orchestrator: OrchestratorV2["Service"],
) {
  const sqlOption = yield* Effect.serviceOption(SqlClient.SqlClient);
  if (Option.isNone(sqlOption)) return;
  const sql = sqlOption.value;
  const tables =
    yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projection_queued_turns'`;
  if (tables.length === 0) return;
  const rows = yield* sql<{
    readonly queued_turn_id: string;
    readonly thread_id: string;
    readonly message_id: string;
    readonly text: string;
    readonly attachments_json: string;
    readonly model_selection_json: string | null;
    readonly title_seed: string | null;
  }>`SELECT queued_turn_id, thread_id, message_id, text, attachments_json, model_selection_json, title_seed
     FROM projection_queued_turns ORDER BY created_at, queued_turn_id`;
  if (rows.length === 0) return;
  const sink = yield* Effect.serviceOption(EventSinkV2);
  if (Option.isNone(sink))
    return yield* Effect.die(new Error("Fork queue import requires the V2 event sink."));
  const legacyImporter = yield* Effect.serviceOption(LegacyV1ThreadImporter);
  for (const row of rows) {
    const threadId = ThreadId.make(row.thread_id);
    if (Option.isSome(legacyImporter)) yield* legacyImporter.value.ensureTranscript(threadId);
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const attachments = yield* decodeAttachments(row.attachments_json);
        const modelSelection =
          row.model_selection_json === null
            ? undefined
            : yield* decodeModel(row.model_selection_json);
        // Deferred dispatch creates the durable run without starting a provider.
        yield* orchestrator.dispatch({
          type: "message.dispatch",
          commandId: CommandId.make(`fork-queue-import:${row.queued_turn_id}`),
          threadId,
          messageId: MessageId.make(row.message_id),
          text: row.text,
          attachments,
          createdBy: "user",
          creationSource: "server",
          dispatchMode: { type: "defer_start" },
          ...(modelSelection === undefined ? {} : { modelSelection }),
          ...(row.title_seed === null ? {} : { titleSeed: row.title_seed }),
        });
        const projection = yield* orchestrator.getThreadRecords(threadId, ["runs"]);
        const run = projection.runs.find((candidate) => candidate.userMessageId === row.message_id);
        if (run === undefined)
          return yield* Effect.die(new Error("Fork queue import did not persist a run."));
        yield* sink.value.write({
          events: [
            {
              id: EventId.make(`fork-queue-import:${row.queued_turn_id}:held`),
              type: "run.updated",
              threadId,
              runId: run.id,
              providerInstanceId: run.providerInstanceId,
              occurredAt: yield* DateTime.now,
              payload: { ...run, status: "queued", queueHeld: true, queuePosition: run.ordinal },
            },
          ],
        });
        yield* sql`DELETE FROM projection_queued_turns WHERE queued_turn_id = ${row.queued_turn_id}`;
      }),
    );
  }
});

import { ChatAttachment, ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  DeleteProjectionQueuedTurnInput,
  DeleteProjectionQueuedTurnsByThreadInput,
  ListProjectionQueuedTurnsInput,
  ProjectionQueuedTurn,
  ProjectionQueuedTurnRepository,
  type ProjectionQueuedTurnRepositoryShape,
} from "../Services/ProjectionQueuedTurns.ts";

const ProjectionQueuedTurnDbRow = ProjectionQueuedTurn.mapFields(
  Struct.assign({
    attachments: Schema.fromJsonString(Schema.Array(ChatAttachment)),
    modelSelection: Schema.NullOr(Schema.fromJsonString(ModelSelection)),
  }),
);

const makeProjectionQueuedTurnRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertProjectionQueuedTurnRow = SqlSchema.void({
    Request: ProjectionQueuedTurn,
    execute: (row) =>
      sql`
        INSERT INTO projection_queued_turns (
          queued_turn_id,
          thread_id,
          message_id,
          text,
          attachments_json,
          model_selection_json,
          title_seed,
          runtime_mode,
          interaction_mode,
          source_proposed_plan_thread_id,
          source_proposed_plan_id,
          steer_requested_at,
          created_at,
          updated_at
        )
        VALUES (
          ${row.queuedTurnId},
          ${row.threadId},
          ${row.messageId},
          ${row.text},
          ${JSON.stringify(row.attachments)},
          ${row.modelSelection === null ? null : JSON.stringify(row.modelSelection)},
          ${row.titleSeed},
          ${row.runtimeMode},
          ${row.interactionMode},
          ${row.sourceProposedPlanThreadId},
          ${row.sourceProposedPlanId},
          ${row.steerRequestedAt},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (queued_turn_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          message_id = excluded.message_id,
          text = excluded.text,
          attachments_json = excluded.attachments_json,
          model_selection_json = excluded.model_selection_json,
          title_seed = excluded.title_seed,
          runtime_mode = excluded.runtime_mode,
          interaction_mode = excluded.interaction_mode,
          source_proposed_plan_thread_id = excluded.source_proposed_plan_thread_id,
          source_proposed_plan_id = excluded.source_proposed_plan_id,
          steer_requested_at = excluded.steer_requested_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
  });

  const listProjectionQueuedTurnRows = SqlSchema.findAll({
    Request: ListProjectionQueuedTurnsInput,
    Result: ProjectionQueuedTurnDbRow,
    execute: ({ threadId }) =>
      sql`
        SELECT
          queued_turn_id AS "queuedTurnId",
          thread_id AS "threadId",
          message_id AS "messageId",
          text,
          attachments_json AS "attachments",
          model_selection_json AS "modelSelection",
          title_seed AS "titleSeed",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          source_proposed_plan_id AS "sourceProposedPlanId",
          steer_requested_at AS "steerRequestedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_queued_turns
        WHERE thread_id = ${threadId}
        ORDER BY
          CASE WHEN steer_requested_at IS NULL THEN 1 ELSE 0 END ASC,
          steer_requested_at ASC,
          created_at ASC,
          queued_turn_id ASC
      `,
  });

  const deleteProjectionQueuedTurnRow = SqlSchema.void({
    Request: DeleteProjectionQueuedTurnInput,
    execute: ({ queuedTurnId }) =>
      sql`
        DELETE FROM projection_queued_turns
        WHERE queued_turn_id = ${queuedTurnId}
      `,
  });

  const deleteProjectionQueuedTurnRowsByThread = SqlSchema.void({
    Request: DeleteProjectionQueuedTurnsByThreadInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM projection_queued_turns
        WHERE thread_id = ${threadId}
      `,
  });

  const upsert: ProjectionQueuedTurnRepositoryShape["upsert"] = (row) =>
    upsertProjectionQueuedTurnRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionQueuedTurnRepository.upsert:query")),
    );

  const listByThreadId: ProjectionQueuedTurnRepositoryShape["listByThreadId"] = (input) =>
    listProjectionQueuedTurnRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionQueuedTurnRepository.listByThreadId:query")),
    );

  const deleteById: ProjectionQueuedTurnRepositoryShape["deleteById"] = (input) =>
    deleteProjectionQueuedTurnRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("ProjectionQueuedTurnRepository.deleteById:query")),
    );

  const deleteByThreadId: ProjectionQueuedTurnRepositoryShape["deleteByThreadId"] = (input) =>
    deleteProjectionQueuedTurnRowsByThread(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProjectionQueuedTurnRepository.deleteByThreadId:query"),
      ),
    );

  return {
    upsert,
    listByThreadId,
    deleteById,
    deleteByThreadId,
  } satisfies ProjectionQueuedTurnRepositoryShape;
});

export const ProjectionQueuedTurnRepositoryLive = Layer.effect(
  ProjectionQueuedTurnRepository,
  makeProjectionQueuedTurnRepository,
);

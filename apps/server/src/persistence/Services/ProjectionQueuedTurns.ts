/**
 * ProjectionQueuedTurnRepository - Projection repository interface for queued turns.
 *
 * Owns persistence operations for server-side queued follow-up turns.
 *
 * @module ProjectionQueuedTurnRepository
 */
import {
  ChatAttachment,
  IsoDateTime,
  MessageId,
  ModelSelection,
  OrchestrationProposedPlanId,
  ProviderInteractionMode,
  QueuedTurnId,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionQueuedTurn = Schema.Struct({
  queuedTurnId: QueuedTurnId,
  threadId: ThreadId,
  messageId: MessageId,
  text: Schema.String,
  attachments: Schema.Array(ChatAttachment),
  modelSelection: Schema.NullOr(ModelSelection),
  titleSeed: Schema.NullOr(Schema.String),
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  sourceProposedPlanThreadId: Schema.NullOr(ThreadId),
  sourceProposedPlanId: Schema.NullOr(OrchestrationProposedPlanId),
  steerRequestedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProjectionQueuedTurn = typeof ProjectionQueuedTurn.Type;

export const ListProjectionQueuedTurnsInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListProjectionQueuedTurnsInput = typeof ListProjectionQueuedTurnsInput.Type;

export const DeleteProjectionQueuedTurnInput = Schema.Struct({
  queuedTurnId: QueuedTurnId,
});
export type DeleteProjectionQueuedTurnInput = typeof DeleteProjectionQueuedTurnInput.Type;

export const DeleteProjectionQueuedTurnsByThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionQueuedTurnsByThreadInput =
  typeof DeleteProjectionQueuedTurnsByThreadInput.Type;

export interface ProjectionQueuedTurnRepositoryShape {
  readonly upsert: (
    queuedTurn: ProjectionQueuedTurn,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listByThreadId: (
    input: ListProjectionQueuedTurnsInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionQueuedTurn>, ProjectionRepositoryError>;
  readonly deleteById: (
    input: DeleteProjectionQueuedTurnInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteByThreadId: (
    input: DeleteProjectionQueuedTurnsByThreadInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionQueuedTurnRepository extends Context.Service<
  ProjectionQueuedTurnRepository,
  ProjectionQueuedTurnRepositoryShape
>()("t3/persistence/Services/ProjectionQueuedTurns/ProjectionQueuedTurnRepository") {}

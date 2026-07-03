import {
  CheckpointRef,
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const asEventId = (value: string): EventId => EventId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asMessageId = (value: string): MessageId => MessageId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);

function makeEvent(input: {
  readonly sequence: number;
  readonly type: OrchestrationEvent["type"];
  readonly aggregateKind: OrchestrationEvent["aggregateKind"];
  readonly aggregateId: ProjectId | ThreadId;
  readonly payload: OrchestrationEvent["payload"];
}): OrchestrationEvent {
  const occurredAt = "2026-01-01T00:00:00.000Z";
  return {
    sequence: input.sequence,
    eventId: asEventId(`event-${input.sequence}`),
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    type: input.type,
    occurredAt,
    commandId: CommandId.make(`cmd-${input.sequence}`),
    causationEventId: null,
    correlationId: CommandId.make(`cmd-${input.sequence}`),
    metadata: {},
    payload: input.payload,
  } as OrchestrationEvent;
}

it.layer(NodeServices.layer)("decider fork", (it) => {
  it.effect("creates a forked thread, clones visible messages, and requests provider fork", () =>
    Effect.gen(function* () {
      const now = "2026-01-01T00:00:00.000Z";
      const sourceThreadId = asThreadId("thread-source");
      const targetThreadId = asThreadId("thread-target");
      const projectId = asProjectId("project-1");
      const sourceTurnId = asTurnId("turn-source");
      const sourceAssistantMessageId = asMessageId("message-source-assistant");
      const modelSelection = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5-codex");

      const withProject = yield* projectEvent(
        createEmptyReadModel(now),
        makeEvent({
          sequence: 1,
          type: "project.created",
          aggregateKind: "project",
          aggregateId: projectId,
          payload: {
            projectId,
            title: "Project",
            workspaceRoot: "/tmp/project",
            defaultModelSelection: null,
            scripts: [],
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      const withThread = yield* projectEvent(
        withProject,
        makeEvent({
          sequence: 2,
          type: "thread.created",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            projectId,
            title: "Source thread",
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "feature/source",
            worktreePath: "/tmp/project-worktree",
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      const withUserMessage = yield* projectEvent(
        withThread,
        makeEvent({
          sequence: 3,
          type: "thread.message-sent",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            messageId: asMessageId("message-source-user"),
            role: "user",
            text: "build it",
            turnId: null,
            streaming: false,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      const withAssistantMessage = yield* projectEvent(
        withUserMessage,
        makeEvent({
          sequence: 4,
          type: "thread.message-sent",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            messageId: sourceAssistantMessageId,
            role: "assistant",
            text: "done",
            turnId: sourceTurnId,
            streaming: false,
            createdAt: "2026-01-01T00:00:01.000Z",
            updatedAt: "2026-01-01T00:00:02.000Z",
          },
        }),
      );
      const withPlan = yield* projectEvent(
        withAssistantMessage,
        makeEvent({
          sequence: 5,
          type: "thread.proposed-plan-upserted",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            proposedPlan: {
              id: "plan-source",
              turnId: sourceTurnId,
              planMarkdown: "Ship fork",
              implementedAt: null,
              implementationThreadId: sourceThreadId,
              createdAt: "2026-01-01T00:00:01.500Z",
              updatedAt: "2026-01-01T00:00:01.500Z",
            },
          },
        }),
      );
      const withCheckpoint = yield* projectEvent(
        withPlan,
        makeEvent({
          sequence: 6,
          type: "thread.turn-diff-completed",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            turnId: sourceTurnId,
            checkpointTurnCount: 1,
            checkpointRef: CheckpointRef.make("checkpoint-source"),
            status: "ready",
            files: [{ path: "src/file.ts", kind: "modified", additions: 1, deletions: 0 }],
            assistantMessageId: sourceAssistantMessageId,
            completedAt: "2026-01-01T00:00:02.000Z",
          },
        }),
      );
      const readModel = yield* projectEvent(
        withCheckpoint,
        makeEvent({
          sequence: 7,
          type: "thread.activity-appended",
          aggregateKind: "thread",
          aggregateId: sourceThreadId,
          payload: {
            threadId: sourceThreadId,
            activity: {
              id: asEventId("activity-source-tool"),
              tone: "tool",
              kind: "tool.completed",
              summary: "Read file",
              payload: { detail: "src/file.ts" },
              turnId: sourceTurnId,
              sequence: 7,
              createdAt: "2026-01-01T00:00:01.250Z",
            },
          },
        }),
      );

      const result = yield* decideOrchestrationCommand({
        readModel,
        command: {
          type: "thread.fork",
          commandId: CommandId.make("cmd-fork"),
          sourceThreadId,
          threadId: targetThreadId,
          createdAt: now,
        },
      });

      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual([
        "thread.created",
        "thread.message-sent",
        "thread.message-sent",
        "thread.proposed-plan-upserted",
        "thread.turn-diff-completed",
        "thread.activity-appended",
        "thread.fork-requested",
      ]);
      expect(events[0]?.payload).toMatchObject({
        threadId: targetThreadId,
        projectId,
        title: "Source thread (fork)",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "feature/source",
        worktreePath: "/tmp/project-worktree",
      });
      expect(events[1]?.payload).toMatchObject({
        threadId: targetThreadId,
        role: "user",
        text: "build it",
        turnId: null,
        streaming: false,
      });
      const messagePayload = events[1]?.payload as { messageId: string } | undefined;
      expect(messagePayload?.messageId).toContain("thread-target:fork-message:00000");
      const assistantPayload = events[2]?.payload as
        | { messageId: MessageId; turnId: TurnId; createdAt: string }
        | undefined;
      expect(assistantPayload?.messageId).toContain("thread-target:fork-message:00001");
      expect(assistantPayload?.turnId).toContain("thread-target:fork-turn:00000");
      expect(assistantPayload?.createdAt).toBe("2026-01-01T00:00:01.000Z");
      const planPayload = events[3]?.payload as
        | { proposedPlan: { id: string; turnId: TurnId; implementationThreadId: ThreadId | null } }
        | undefined;
      expect(planPayload?.proposedPlan.id).toContain("thread-target:fork-plan:00000");
      expect(planPayload?.proposedPlan.turnId).toBe(assistantPayload?.turnId);
      expect(planPayload?.proposedPlan.implementationThreadId).toBe(targetThreadId);
      const checkpointPayload = events[4]?.payload as
        | { turnId: TurnId; assistantMessageId: MessageId | null }
        | undefined;
      expect(checkpointPayload?.turnId).toBe(assistantPayload?.turnId);
      expect(checkpointPayload?.assistantMessageId).toBe(assistantPayload?.messageId);
      const activityPayload = events[5]?.payload as
        | { activity: { id: EventId; turnId: TurnId | null; summary: string } }
        | undefined;
      expect(activityPayload?.activity.id).toContain("thread-target:fork-activity:00000");
      expect(activityPayload?.activity.turnId).toBe(assistantPayload?.turnId);
      expect(activityPayload?.activity.summary).toBe("Read file");
      expect(events[6]?.payload).toEqual({
        sourceThreadId,
        threadId: targetThreadId,
        createdAt: now,
      });
    }),
  );
});

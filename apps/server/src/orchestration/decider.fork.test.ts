import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
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
      const readModel = yield* projectEvent(
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
      expect(events[2]?.payload).toEqual({
        sourceThreadId,
        threadId: targetThreadId,
        createdAt: now,
      });
    }),
  );
});

import {
  EventId,
  TurnItemId,
  ProviderDriverKind,
  type ExternalConversationProvider,
  type ModelSelection,
  type ProjectId,
  type ProviderThreadId,
  type ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { externalConversationRuns } from "./externalConversationRuns.ts";
import { nativeConversationThread } from "./nativeConversationThread.ts";
import * as DateTime from "effect/DateTime";
import type { ParsedExternalConversation } from "./TranscriptParsers.ts";

/** Converts native transcripts at the import boundary; V2 stores only its own events. */
export function externalConversationEvents(input: {
  readonly threadId: ThreadId;
  readonly providerThreadId: ProviderThreadId;
  readonly projectId: ProjectId;
  readonly provider: ExternalConversationProvider;
  readonly modelSelection: ModelSelection;
  readonly parsed: ParsedExternalConversation;
}): ReadonlyArray<OrchestrationV2DomainEvent> {
  const { threadId, providerThreadId, projectId, provider, modelSelection, parsed } = input;
  const createdAt = DateTime.makeUnsafe(parsed.createdAt);
  const updatedAt = DateTime.makeUnsafe(parsed.updatedAt);
  const thread: OrchestrationV2AppThread = {
    createdBy: "user",
    creationSource: "server",
    id: threadId,
    projectId,
    title: parsed.title,
    providerInstanceId: modelSelection.instanceId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    linkedPullRequest: null,
    branchPullRequest: null,
    activeProviderThreadId: providerThreadId,
    historyOrigin: "v1_import",
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
    forkedFrom: null,
    createdAt,
    updatedAt,
    archivedAt: null,
    settledOverride: "settled",
    settledAt: updatedAt,
    unsettledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    pinOrderKey: null,
    activeOrderKey: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
  const providerThread = nativeConversationThread({
    threadId,
    provider,
    modelSelection,
    resumeCursor: parsed.resumeCursor,
    createdAt,
    updatedAt,
  });
  if (providerThread === undefined)
    throw new Error("The transcript has no native continuation reference.");

  const runs = externalConversationRuns(input);
  const events: OrchestrationV2DomainEvent[] = [
    {
      id: EventId.make(`external-import:${threadId}:created`),
      type: "thread.created",
      threadId,
      providerInstanceId: modelSelection.instanceId,
      occurredAt: createdAt,
      payload: thread,
    },
    ...runs.events,
  ];
  // Tool-start and tool-completion records describe one timeline item.
  const tools = new Map(parsed.activities.map((activity) => [activity.id, activity]));
  const records = [
    ...parsed.messages.map((message) => ({
      kind: "message" as const,
      at: message.createdAt,
      message,
    })),
    ...Array.from(tools.values(), (activity) => ({
      kind: "tool" as const,
      at: activity.createdAt,
      activity,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  records.forEach((record, index) => {
    const at = DateTime.makeUnsafe(record.at);
    const id = TurnItemId.make(`external-import:${threadId}:item:${index}`);
    const turnId = record.kind === "message" ? record.message.turnId : record.activity.turnId;
    const boundary = turnId === null ? undefined : runs.boundaries.get(turnId);
    const runId = boundary?.runId ?? null;
    const nodeId = boundary?.nodeId ?? null;
    const common = {
      id,
      threadId,
      runId,
      nodeId,
      providerThreadId,
      providerTurnId: boundary?.providerTurnId ?? null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: index + 1,
      status: "completed" as const,
      title: null,
      startedAt: at,
      completedAt: at,
      updatedAt: at,
    };
    let item: OrchestrationV2TurnItem;
    if (record.kind === "message") {
      const message: OrchestrationV2ConversationMessage = {
        id: record.message.id,
        threadId,
        runId,
        nodeId,
        createdBy: record.message.role === "user" ? "user" : "agent",
        creationSource: "server",
        role: record.message.role,
        text: record.message.text,
        attachments: [],
        streaming: false,
        createdAt: at,
        updatedAt: DateTime.makeUnsafe(record.message.updatedAt),
      };
      events.push({
        id: EventId.make(`external-import:${threadId}:message:${index}`),
        type: "message.updated",
        threadId,
        occurredAt: at,
        payload: message,
      });
      item =
        record.message.role === "user"
          ? {
              ...common,
              type: "user_message",
              createdBy: "user",
              creationSource: "server",
              messageId: message.id,
              inputIntent: "turn_start",
              text: message.text,
              attachments: [],
            }
          : {
              ...common,
              type: "assistant_message",
              messageId: message.id,
              text: message.text,
              streaming: false,
            };
    } else {
      const { activity } = record;
      item = {
        ...common,
        type: "dynamic_tool",
        title: activity.summary,
        status:
          activity.tone === "error"
            ? "failed"
            : activity.kind === "tool.started"
              ? "interrupted"
              : "completed",
        toolName: activity.payload.data.toolName,
        input: activity.payload.data.input,
        output: activity.payload.data.result,
      };
    }
    events.push({
      id: EventId.make(`external-import:${threadId}:item:${index}`),
      type: "turn-item.updated",
      threadId,
      occurredAt: at,
      payload: item,
    });
  });
  events.push({
    id: EventId.make(`external-import:${threadId}:provider-thread`),
    type: "provider-thread.updated",
    threadId,
    driver: ProviderDriverKind.make(provider),
    providerInstanceId: modelSelection.instanceId,
    occurredAt: updatedAt,
    payload: providerThread,
  });
  return events;
}

import {
  EventId,
  RunId,
  RunAttemptId,
  NodeId,
  ProviderTurnId,
  ProviderDriverKind,
  type ModelSelection,
  type ThreadId,
  type ProviderThreadId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2RunAttempt,
  type OrchestrationV2ExecutionNode,
  type OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ParsedExternalConversation } from "./TranscriptParsers.ts";

const decodeResumePoints = Schema.decodeUnknownOption(
  Schema.Struct({
    resumePoints: Schema.Array(
      Schema.Struct({ turnId: Schema.String, resumeSessionAt: Schema.String }),
    ),
  }),
);

/** Imported responses need durable run boundaries so they can be forked in V2. */
export function externalConversationRuns(input: {
  readonly threadId: ThreadId;
  readonly providerThreadId: ProviderThreadId;
  readonly provider: string;
  readonly modelSelection: ModelSelection;
  readonly parsed: ParsedExternalConversation;
}) {
  const { threadId, providerThreadId, modelSelection, parsed } = input;
  const driver = ProviderDriverKind.make(input.provider);
  const points = decodeResumePoints(parsed.resumeCursor);
  const heads = new Map(
    Option.isSome(points)
      ? points.value.resumePoints.map((point) => [point.turnId, point.resumeSessionAt])
      : [],
  );
  const groups = new Map<string, (typeof parsed.messages)[number][]>();
  for (const message of parsed.messages) {
    if (message.turnId === null) continue;
    const group = groups.get(message.turnId) ?? [];
    group.push(message);
    groups.set(message.turnId, group);
  }
  const events: OrchestrationV2DomainEvent[] = [];
  const boundaries = new Map<
    string,
    { runId: RunId; nodeId: NodeId; providerTurnId: ProviderTurnId; ordinal: number }
  >();
  for (const [turnId, messages] of groups) {
    const user = messages.find((message) => message.role === "user");
    if (user === undefined) continue;
    const ordinal = boundaries.size + 1;
    const runId = RunId.make(`external-import:${threadId}:run:${ordinal}`);
    const attemptId = RunAttemptId.make(`external-import:${threadId}:attempt:${ordinal}`);
    const nodeId = NodeId.make(`external-import:${threadId}:node:${ordinal}`);
    const providerTurnId = ProviderTurnId.make(`external-import:${threadId}:turn:${ordinal}`);
    const startedAt = DateTime.makeUnsafe(user.createdAt);
    const completedAt = DateTime.makeUnsafe(messages.at(-1)!.updatedAt);
    const status = messages.some((message) => message.role === "assistant")
      ? ("completed" as const)
      : ("interrupted" as const);
    boundaries.set(turnId, { runId, nodeId, providerTurnId, ordinal });
    const run: OrchestrationV2Run = {
      id: runId,
      threadId,
      ordinal,
      providerInstanceId: modelSelection.instanceId,
      modelSelection,
      providerThreadId,
      userMessageId: user.id,
      rootNodeId: nodeId,
      activeAttemptId: attemptId,
      status,
      requestedAt: startedAt,
      startedAt,
      completedAt,
      checkpointId: null,
      contextHandoffId: null,
    };
    const attempt: OrchestrationV2RunAttempt = {
      id: attemptId,
      runId,
      attemptOrdinal: 1,
      rootNodeId: nodeId,
      providerInstanceId: modelSelection.instanceId,
      providerThreadId,
      nativeThreadId: parsed.externalThreadId,
      providerTurnId,
      reason: "initial",
      status,
      startedAt,
      completedAt,
    };
    const node: OrchestrationV2ExecutionNode = {
      id: nodeId,
      threadId,
      runId,
      parentNodeId: null,
      rootNodeId: nodeId,
      kind: "root_turn",
      status,
      countsForRun: true,
      providerThreadId,
      providerTurnId,
      nativeItemRef: null,
      runtimeRequestId: null,
      checkpointScopeId: null,
      startedAt,
      completedAt,
    };
    const nativeId =
      driver === "claudeAgent"
        ? heads.get(turnId)
        : turnId.startsWith("import:")
          ? undefined
          : turnId;
    const providerTurn: OrchestrationV2ProviderTurn = {
      id: providerTurnId,
      providerThreadId,
      nodeId,
      runAttemptId: attemptId,
      nativeTurnRef: {
        driver,
        nativeId: nativeId ?? null,
        strength: nativeId === undefined ? "none" : "strong",
        ordinal,
      },
      ordinal,
      status,
      startedAt,
      completedAt,
    };
    events.push(
      {
        id: EventId.make(`${runId}:created`),
        type: "run.created",
        threadId,
        runId,
        providerInstanceId: modelSelection.instanceId,
        occurredAt: startedAt,
        payload: run,
      },
      {
        id: EventId.make(`${runId}:attempt`),
        type: "run-attempt.created",
        threadId,
        runId,
        occurredAt: startedAt,
        payload: attempt,
      },
      {
        id: EventId.make(`${runId}:node`),
        type: "node.updated",
        threadId,
        runId,
        occurredAt: completedAt,
        payload: node,
      },
      {
        id: EventId.make(`${runId}:provider-turn`),
        type: "provider-turn.updated",
        threadId,
        runId,
        driver,
        occurredAt: completedAt,
        payload: providerTurn,
      },
    );
  }
  return { events, boundaries };
}

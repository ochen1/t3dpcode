import {
  ProviderDriverKind,
  type ModelSelection,
  type OrchestrationV2ProviderThread,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { deriveProviderThread } from "@t3tools/provider-core/server/IdAllocator";

const decodeCursor = Schema.decodeUnknownOption(
  Schema.Struct({
    resume: Schema.optional(Schema.String),
    threadId: Schema.optional(Schema.String),
    sessionId: Schema.optional(Schema.String),
    resumeSessionAt: Schema.optional(Schema.String),
    turnStartMessageIds: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  }),
);

/** Keeps native continuation references while old fork threads move into V2. */
export function nativeConversationThread(input: {
  readonly threadId: ThreadId;
  readonly provider: string;
  readonly modelSelection: ModelSelection;
  readonly resumeCursor: unknown;
  readonly createdAt: DateTime.Utc;
  readonly updatedAt: DateTime.Utc;
}): OrchestrationV2ProviderThread | undefined {
  if (input.provider !== "codex" && input.provider !== "claudeAgent") return undefined;
  const cursor = decodeCursor(input.resumeCursor);
  if (Option.isNone(cursor)) return undefined;
  const nativeId =
    input.provider === "codex"
      ? cursor.value.threadId
      : (cursor.value.resume ?? cursor.value.sessionId);
  if (!nativeId?.trim()) return undefined;
  // The old runtime kept the initial resume bookmark after subsequent turns.
  // Its recorded assistant boundaries contain the actual continuation head.
  const conversationHead =
    cursor.value.turnStartMessageIds?.findLast((id) => id !== null && id.trim().length > 0) ??
    cursor.value.resumeSessionAt;
  const driver = ProviderDriverKind.make(input.provider);
  return {
    id: deriveProviderThread({
      driver,
      nativeThreadId: nativeId,
      providerInstanceId: input.modelSelection.instanceId,
    }),
    driver,
    providerInstanceId: input.modelSelection.instanceId,
    providerSessionId: null,
    appThreadId: input.threadId,
    ownerNodeId: null,
    nativeThreadRef: { driver, nativeId, strength: "strong" },
    nativeConversationHeadRef:
      input.provider === "claudeAgent" && conversationHead
        ? { driver, nativeId: conversationHead, strength: "strong" }
        : null,
    status: "idle",
    firstRunOrdinal: null,
    lastRunOrdinal: null,
    handoffIds: [],
    forkedFrom: null,
    pendingBackgroundTasks: [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { EventSinkV2 } from "../orchestration-v2/EventSink.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { ProjectionStoreV2 } from "../orchestration-v2/ProjectionStore.ts";
import * as RuntimeLayer from "../orchestration-v2/runtimeLayer.ts";
import { externalConversationEvents } from "./externalConversationEvents.ts";
import { nativeConversationThread } from "./nativeConversationThread.ts";
import { parseClaudeTranscript } from "./TranscriptParsers.ts";

const nativeId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const at = "2026-09-21T12:00:00.000Z";
const transcript = [
  {
    type: "user",
    sessionId: nativeId,
    uuid: "user",
    parentUuid: null,
    timestamp: at,
    message: { role: "user", content: "Read the file" },
  },
  {
    type: "assistant",
    sessionId: nativeId,
    uuid: "assistant-1",
    parentUuid: "user",
    timestamp: at,
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "read", name: "Read", input: { file_path: "/repo/file.ts" } },
      ],
    },
  },
  {
    type: "user",
    sessionId: nativeId,
    uuid: "result",
    parentUuid: "assistant-1",
    timestamp: at,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "read", content: "file content" }],
    },
  },
  {
    type: "assistant",
    sessionId: nativeId,
    uuid: "assistant-2",
    parentUuid: "result",
    timestamp: at,
    message: { role: "assistant", content: "Done" },
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");
const database = SqlitePersistence.layerMemory;
const layer = Layer.mergeAll(RuntimeLayer.layerEventSink, ProjectionStore.layer).pipe(
  Layer.provide(database),
);

it.effect("projects imported text and tools, preserving the native continuation head", () =>
  Effect.gen(function* () {
    const parsed = parseClaudeTranscript(transcript, nativeId);
    assert.ok(parsed);
    const threadId = ThreadId.make("external:claude");
    const modelSelection = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-sonnet-4-5",
    };
    const provider = nativeConversationThread({
      threadId,
      provider: "claudeAgent",
      modelSelection,
      resumeCursor: parsed.resumeCursor,
      createdAt: DateTime.makeUnsafe(at),
      updatedAt: DateTime.makeUnsafe(at),
    });
    assert.ok(provider);
    const events = externalConversationEvents({
      threadId,
      providerThreadId: provider.id,
      projectId: ProjectId.make("project:external"),
      provider: "claudeAgent",
      modelSelection,
      parsed,
    });
    yield* (yield* EventSinkV2).write({ events });
    const projection = yield* (yield* ProjectionStoreV2).getThreadProjection(threadId);
    assert.deepEqual(
      projection.messages.map((message) => message.text),
      ["Read the file", "Done"],
    );
    assert.equal(projection.turnItems.filter((item) => item.type === "dynamic_tool").length, 1);
    assert.equal(projection.providerThreads[0]?.nativeThreadRef?.nativeId, nativeId);
    assert.equal(projection.providerThreads[0]?.nativeConversationHeadRef?.nativeId, "assistant-2");
    assert.equal(projection.thread.activeProviderThreadId, provider.id);
    assert.equal(projection.runs[0]?.status, "completed");
    assert.equal(projection.messages[1]?.runId, projection.runs[0]?.id);
    assert.equal(projection.providerTurns[0]?.nativeTurnRef?.nativeId, "assistant-2");
  }).pipe(Effect.provide(layer)),
);

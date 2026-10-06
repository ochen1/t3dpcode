import {
  EventId,
  MessageId,
  ModelSelection,
  ThreadId,
  TurnId,
  TurnItemId,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { externalConversationEvents } from "./externalConversationEvents.ts";
import { nativeConversationThread } from "./nativeConversationThread.ts";

const decodeMarker = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ externalConversation: Schema.Unknown })),
);
const decodeCursor = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const Activity = Schema.Struct({
  id: EventId,
  tone: Schema.Literals(["tool", "error"]),
  kind: Schema.String,
  summary: Schema.String,
  turnId: Schema.NullOr(TurnId),
  sequence: Schema.Number,
  createdAt: Schema.String,
  payload: Schema.Struct({
    itemType: Schema.String,
    status: Schema.String,
    title: Schema.String,
    detail: Schema.optionalKey(Schema.String),
    data: Schema.Struct({
      toolCallId: Schema.String,
      toolName: Schema.String,
      input: Schema.Unknown,
      command: Schema.optionalKey(Schema.String),
      rawInput: Schema.optionalKey(Schema.String),
      result: Schema.optionalKey(Schema.Unknown),
      output: Schema.optionalKey(Schema.String),
      native: Schema.Struct({ call: Schema.Unknown, result: Schema.optionalKey(Schema.Unknown) }),
    }),
  }),
});
const decodePayload = Schema.decodeUnknownOption(Schema.fromJsonString(Activity.fields.payload));
const decodeActivity = Schema.decodeUnknownOption(Activity);

/** Hydrates the fork's previously imported tool history and response boundaries lazily. */
export const importForkTranscript = Effect.fn("importForkTranscript")(function* (
  threadId: ThreadId,
  modelSelection: ModelSelection,
  projectId: import("@t3tools/contracts").ProjectId,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    readonly provider_name: string;
    readonly resume_cursor_json: string | null;
    readonly runtime_payload_json: string | null;
  }>`SELECT provider_name, resume_cursor_json, runtime_payload_json FROM provider_session_runtime WHERE thread_id = ${threadId}`;
  const runtime = rows[0];
  if (
    runtime?.runtime_payload_json === null ||
    runtime?.runtime_payload_json === undefined ||
    Option.isNone(decodeMarker(runtime.runtime_payload_json))
  )
    return undefined;
  if (runtime.provider_name !== "claudeAgent" && runtime.provider_name !== "codex")
    return undefined;
  const messages = yield* sql<{
    readonly message_id: string;
    readonly role: "user" | "assistant";
    readonly text: string;
    readonly turn_id: string | null;
    readonly created_at: string;
    readonly updated_at: string;
  }>`SELECT message_id, role, text, turn_id, created_at, updated_at FROM projection_thread_messages
     WHERE thread_id = ${threadId} AND role IN ('user', 'assistant') ORDER BY created_at, message_id`;
  if (messages.length === 0) return undefined;
  const createdAt = messages[0]!.created_at;
  const updatedAt = messages.at(-1)!.updated_at;
  const resumeCursor = yield* decodeCursor(runtime.resume_cursor_json ?? "null");
  const providerThread = nativeConversationThread({
    threadId,
    provider: runtime.provider_name,
    modelSelection,
    resumeCursor,
    createdAt: DateTime.makeUnsafe(createdAt),
    updatedAt: DateTime.makeUnsafe(updatedAt),
  });
  if (providerThread === undefined) return undefined;
  const activities = yield* sql<{
    readonly activity_id: string;
    readonly tone: string;
    readonly kind: string;
    readonly summary: string;
    readonly turn_id: string | null;
    readonly sequence: number;
    readonly created_at: string;
    readonly payload_json: string;
  }>`SELECT activity_id, tone, kind, summary, turn_id, sequence, created_at, payload_json
     FROM projection_thread_activities WHERE thread_id = ${threadId} ORDER BY sequence, created_at, activity_id`;
  const parsedActivities = activities.flatMap((activity) => {
    const payload = decodePayload(activity.payload_json);
    if (Option.isNone(payload)) return [];
    const decoded = decodeActivity({
      id: activity.activity_id,
      tone: activity.tone,
      kind: activity.kind,
      summary: activity.summary,
      turnId: activity.turn_id,
      sequence: activity.sequence,
      createdAt: activity.created_at,
      payload: payload.value,
    });
    if (Option.isNone(decoded)) return [];
    const { result, ...native } = decoded.value.payload.data.native;
    return [
      {
        ...decoded.value,
        payload: {
          ...decoded.value.payload,
          data: {
            ...decoded.value.payload.data,
            native: { ...native, ...(result === undefined ? {} : { result }) },
          },
        },
      },
    ];
  });
  const events = externalConversationEvents({
    threadId,
    providerThreadId: providerThread.id,
    projectId,
    provider: runtime.provider_name,
    modelSelection,
    parsed: {
      externalThreadId: providerThread.nativeThreadRef!.nativeId!,
      title: "Imported conversation",
      model: modelSelection.model,
      cwd: undefined,
      createdAt,
      updatedAt,
      resumeCursor,
      messages: messages.map((message) => ({
        id: MessageId.make(message.message_id),
        role: message.role,
        text: message.text,
        turnId: message.turn_id === null ? null : TurnId.make(message.turn_id),
        streaming: false,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
      })),
      activities: parsedActivities,
    },
  });
  return events
    .filter((event) => event.type !== "thread.created")
    .map((event): OrchestrationV2DomainEvent => {
      const id = EventId.make(`fork-v1-import:${event.id}`);
      if (
        event.type === "turn-item.updated" &&
        (event.payload.type === "user_message" || event.payload.type === "assistant_message")
      ) {
        return {
          ...event,
          id,
          payload: { ...event.payload, id: importMessageTurnItemId(event.payload.messageId) },
        };
      }
      return { ...event, id };
    });
});

function importMessageTurnItemId(messageId: MessageId) {
  return TurnItemId.make(`migration:v1:turn-item:${messageId}`);
}

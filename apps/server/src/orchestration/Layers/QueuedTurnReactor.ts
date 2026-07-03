import {
  CommandId,
  type OrchestrationEvent,
  type OrchestrationThread,
  type ThreadId,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { QueuedTurnReactor, type QueuedTurnReactorShape } from "../Services/QueuedTurnReactor.ts";

type QueuedTurnTriggerEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.queued-turn-enqueued"
      | "thread.queued-turn-steer-requested"
      | "thread.session-set"
      | "thread.turn-diff-completed";
  }
>;

type ReactorInput =
  | {
      readonly source: "startup";
      readonly threadId: ThreadId;
    }
  | {
      readonly source: "domain";
      readonly event: QueuedTurnTriggerEvent;
    };

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

function triggerThreadId(event: QueuedTurnTriggerEvent): ThreadId {
  return event.payload.threadId;
}

function hasRunningProviderTurn(thread: OrchestrationThread): boolean {
  return (
    thread.session?.status === "starting" ||
    thread.session?.status === "running" ||
    thread.latestTurn?.state === "running"
  );
}

function isQueueTriggerEvent(event: OrchestrationEvent): event is QueuedTurnTriggerEvent {
  return (
    event.type === "thread.queued-turn-enqueued" ||
    event.type === "thread.queued-turn-steer-requested" ||
    event.type === "thread.session-set" ||
    event.type === "thread.turn-diff-completed"
  );
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const pendingTurnStartThreadIds = new Set<string>();

  const serverCommandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));

  const dispatchNextQueuedTurn = Effect.fn("dispatchNextQueuedTurn")(function* (
    threadId: ThreadId,
  ) {
    const threadOption = yield* projectionSnapshotQuery.getThreadDetailById(threadId);
    if (Option.isNone(threadOption)) {
      return;
    }

    const thread = threadOption.value;
    const blocked = hasRunningProviderTurn(thread) || pendingTurnStartThreadIds.has(thread.id);
    const queuedTurn = thread.queuedTurns.at(0) ?? null;
    if (blocked || queuedTurn === null) {
      return;
    }

    const createdAt = yield* nowIso;
    yield* orchestrationEngine.dispatch({
      type: "thread.queued-turn.dispatch",
      commandId: yield* serverCommandId("queued-turn-dispatch"),
      threadId: thread.id,
      queuedTurnId: queuedTurn.id,
      createdAt,
    });
    pendingTurnStartThreadIds.add(thread.id);
  });

  const maybeInterruptForSteer = Effect.fn("maybeInterruptForSteer")(function* (
    event: Extract<QueuedTurnTriggerEvent, { type: "thread.queued-turn-steer-requested" }>,
  ) {
    const threadOption = yield* projectionSnapshotQuery.getThreadDetailById(event.payload.threadId);
    if (Option.isNone(threadOption)) {
      return;
    }

    const thread = threadOption.value;
    if (!hasRunningProviderTurn(thread)) {
      if (!pendingTurnStartThreadIds.has(thread.id)) {
        yield* dispatchNextQueuedTurn(thread.id);
      }
      return;
    }

    yield* orchestrationEngine.dispatch({
      type: "thread.turn.interrupt",
      commandId: yield* serverCommandId("queued-turn-steer-interrupt"),
      threadId: thread.id,
      ...(thread.latestTurn?.turnId !== undefined ? { turnId: thread.latestTurn.turnId } : {}),
      createdAt: event.payload.requestedAt,
    });
  });

  const processInput = Effect.fn("processQueuedTurnReactorInput")(function* (input: ReactorInput) {
    if (input.source === "startup") {
      yield* dispatchNextQueuedTurn(input.threadId);
      return;
    }

    const { event } = input;
    if (event.type === "thread.session-set") {
      pendingTurnStartThreadIds.delete(event.payload.threadId);
    }

    if (event.type === "thread.queued-turn-steer-requested") {
      yield* maybeInterruptForSteer(event);
      return;
    }

    yield* dispatchNextQueuedTurn(triggerThreadId(event));
  });

  const processInputSafely = (input: ReactorInput) =>
    processInput(input).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("queued turn reactor failed to process input", {
          source: input.source,
          eventType: input.source === "domain" ? input.event.type : "startup",
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processInputSafely);

  const enqueueStartupThreads = projectionSnapshotQuery.getCommandReadModel().pipe(
    Effect.flatMap((readModel) =>
      Effect.forEach(
        readModel.threads,
        (thread) =>
          thread.queuedTurns.length > 0
            ? worker.enqueue({ source: "startup", threadId: thread.id })
            : Effect.void,
        { concurrency: 1 },
      ),
    ),
    Effect.asVoid,
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.void;
      }
      return Effect.logWarning("queued turn reactor failed to enqueue startup threads", {
        cause: Cause.pretty(cause),
      });
    }),
  );

  const start: QueuedTurnReactorShape["start"] = Effect.fn("startQueuedTurnReactor")(function* () {
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (!isQueueTriggerEvent(event)) {
          return Effect.void;
        }
        return worker.enqueue({ source: "domain", event });
      }),
    );
    yield* enqueueStartupThreads;
  });

  return {
    start,
    drain: worker.drain,
  } satisfies QueuedTurnReactorShape;
});

export const QueuedTurnReactorLive = Layer.effect(QueuedTurnReactor, make);

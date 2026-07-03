/**
 * QueuedTurnReactor - Server-side queued turn dispatcher interface.
 *
 * Owns background workers that react to queued follow-up turns and dispatch
 * them once the owning thread is no longer running.
 *
 * @module QueuedTurnReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface QueuedTurnReactorShape {
  /**
   * Start reacting to queued-turn orchestration domain events.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

export class QueuedTurnReactor extends Context.Service<QueuedTurnReactor, QueuedTurnReactorShape>()(
  "t3/orchestration/Services/QueuedTurnReactor",
) {}

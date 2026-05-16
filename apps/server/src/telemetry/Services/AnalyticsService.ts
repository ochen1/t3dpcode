/**
 * AnalyticsService - Disabled analytics contract.
 *
 * Provides a no-op event API so existing call sites can remain simple without
 * sending telemetry or allocating background flush work.
 *
 * @module AnalyticsService
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface AnalyticsServiceShape {
  /**
   * Ignore an analytics event.
   */
  readonly record: (
    event: string,
    properties?: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void, never>;

  /**
   * No-op flush retained for call sites that coordinate shutdown.
   */
  readonly flush: Effect.Effect<void, never>;
}

export class AnalyticsService extends Context.Service<AnalyticsService, AnalyticsServiceShape>()(
  "t3/telemetry/Services/AnalyticsService",
) {
  static readonly layerTest = Layer.succeed(AnalyticsService, {
    record: () => Effect.void,
    flush: Effect.void,
  });
}

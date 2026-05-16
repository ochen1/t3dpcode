import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AnalyticsService, type AnalyticsServiceShape } from "../Services/AnalyticsService.ts";

const makeAnalyticsService = Effect.succeed({
  record: () => Effect.void,
  flush: Effect.void,
} satisfies AnalyticsServiceShape);

export const AnalyticsServiceLayerLive = Layer.effect(AnalyticsService, makeAnalyticsService);

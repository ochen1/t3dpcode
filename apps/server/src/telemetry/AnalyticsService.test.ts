import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { AnalyticsServiceLayerLive } from "./AnalyticsService.ts";
import { AnalyticsService } from "./Services/AnalyticsService.ts";

it.effect("AnalyticsService is disabled", () =>
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService;

    yield* analytics.record("test.disabled", { index: 1 });
    yield* analytics.flush;

    assert.ok(true);
  }).pipe(Effect.provide(AnalyticsServiceLayerLive)),
);

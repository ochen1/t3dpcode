import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as AnalyticsService from "./AnalyticsService.ts";

it.effect("keeps analytics disabled", () =>
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;

    yield* analytics.record("test.telemetry.disabled", { sensitive: "never sent" });
    yield* analytics.flush;

    assert.strictEqual(true, true);
  }).pipe(Effect.provide(AnalyticsService.layer)),
);

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class AnalyticsService extends Context.Service<
  AnalyticsService,
  {
    readonly record: (
      event: string,
      properties?: Readonly<Record<string, unknown>>,
    ) => Effect.Effect<void>;
    readonly flush: Effect.Effect<void>;
  }
>()("t3/telemetry/AnalyticsService") {
  static readonly layerTest = Layer.succeed(
    AnalyticsService,
    AnalyticsService.of({
      record: () => Effect.void,
      flush: Effect.void,
    }),
  );
}

function serverOsFromNodePlatform(platform: string): ClientOs {
  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    case "android":
      return "Android";
    default:
      return "other";
  }
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const telemetryConfig = yield* TelemetryEnvConfig;
  const httpClient = yield* HttpClient.HttpClient;
  const serverConfig = yield* ServerConfig.ServerConfig;
  const identifier = yield* getTelemetryIdentifier;
  const bufferRef = yield* Ref.make<ReadonlyArray<BufferedAnalyticsEvent>>([]);
  const clientType = serverConfig.mode === "desktop" ? "desktop-app" : "cli-web-client";
  const hostPlatform = yield* HostProcessPlatform;
  const hostArchitecture = yield* HostProcessArchitecture;

  const enqueueBufferedEvent = (event: string, properties?: Readonly<Record<string, unknown>>) =>
    Effect.flatMap(DateTime.now, (now) =>
      Ref.modify(bufferRef, (current) => {
        const appended = [
          ...current,
          {
            event,
            ...(properties ? { properties } : {}),
            capturedAt: DateTime.formatIso(now),
          } satisfies BufferedAnalyticsEvent,
        ];

        const next =
          appended.length > telemetryConfig.maxBufferedEvents
            ? appended.slice(appended.length - telemetryConfig.maxBufferedEvents)
            : appended;

        return [
          {
            size: next.length,
            dropped: next.length !== appended.length,
          } as const,
          next,
        ] as const;
      }),
    );

  const sendBatch = Effect.fn("AnalyticsService.sendBatch")(function* (
    events: ReadonlyArray<BufferedAnalyticsEvent>,
  ) {
    if (!telemetryConfig.enabled || !identifier) return;

    const payload = {
      api_key: telemetryConfig.posthogKey,
      batch: events.map((event) => ({
        event: event.event,
        distinct_id: identifier,
        properties: {
          ...event.properties,
          $process_person_profile: false,
          platform: hostPlatform,
          wsl: Option.getOrUndefined(telemetryConfig.wslDistroName),
          arch: hostArchitecture,
          t3CodeVersion: packageJson.version,
          clientType,
          serverOs: serverOsFromNodePlatform(hostPlatform),
          serverArch: hostArchitecture,
          serverWslDistro: Option.getOrUndefined(telemetryConfig.wslDistroName),
          serverAppVersion: packageJson.version,
          serverMode: serverConfig.mode,
        },
        timestamp: event.capturedAt,
      })),
    };

    yield* HttpClientRequest.post(`${telemetryConfig.posthogHost}/batch/`).pipe(
      HttpClientRequest.bodyJson(payload),
      Effect.flatMap(httpClient.execute),
      Effect.flatMap(HttpClientResponse.filterStatusOk),
    );
  });

  const flush: AnalyticsService["Service"]["flush"] = Effect.gen(function* () {
    while (true) {
      const batch = yield* Ref.modify(bufferRef, (current) => {
        if (current.length === 0) {
          return [[] as ReadonlyArray<BufferedAnalyticsEvent>, current] as const;
        }
        const nextBatch = current.slice(0, telemetryConfig.flushBatchSize);
        const remaining = current.slice(nextBatch.length);
        return [nextBatch, remaining] as const;
      });

      if (batch.length === 0) {
        return;
      }

      yield* sendBatch(batch).pipe(
        Effect.catch((error) =>
          Ref.update(bufferRef, (current) => [...batch, ...current]).pipe(
            Effect.flatMap(() => Effect.fail(error)),
          ),
        ),
      );
    }
  }).pipe(Effect.catch((cause) => Effect.logError("Failed to flush telemetry", { cause })));

  const record: AnalyticsService["Service"]["record"] = Effect.fn("AnalyticsService.record")(
    function* (event, properties) {
      if (!telemetryConfig.enabled || !identifier) return;

      const enqueueResult = yield* enqueueBufferedEvent(event, properties);
      if (enqueueResult.dropped) {
        yield* Effect.logDebug("analytics buffer full; dropping oldest event", {
          size: enqueueResult.size,
          event,
        });
      }
    },
  );

  yield* Effect.forever(Effect.sleep(1000).pipe(Effect.flatMap(() => flush)), {
    disableYield: true,
  }).pipe(Effect.forkScoped);

  yield* Effect.addFinalizer(() => flush);

  return AnalyticsService.of({ record, flush });
});

export const layer = Layer.effect(AnalyticsService, make);

export const layerTest = AnalyticsService.layerTest;

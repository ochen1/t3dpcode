import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";

export interface ClientTracingConfig {
  readonly exportIntervalMs?: number;
}

export const ClientTracingLive = Layer.succeed(
  Tracer.Tracer,
  Tracer.make({
    span: (options) => new Tracer.NativeSpan(options),
  }),
);

export function configureClientTracing(config: ClientTracingConfig = {}): Promise<void> {
  void config;
  return Promise.resolve();
}
export async function __resetClientTracingForTests() {
  return;
}

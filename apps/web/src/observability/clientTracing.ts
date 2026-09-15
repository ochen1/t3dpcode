import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";

export interface ClientTracingConfig {
  readonly exportIntervalMs?: number;
}

export function configureClientTracing(config: ClientTracingConfig = {}): Promise<void> {
  void config;
  return Promise.resolve();
}
export async function __resetClientTracingForTests() {
  return;
}

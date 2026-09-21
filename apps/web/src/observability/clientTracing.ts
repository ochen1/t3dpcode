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

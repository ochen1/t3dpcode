import * as Layer from "effect/Layer";

export interface TracingConfig {
  readonly tracesUrl: string;
  readonly tracesDataset: string;
  readonly tracesToken: string;
}

export interface TracingResource {
  readonly serviceVersion?: string;
  readonly appVariant: string;
}

export function resolveTracingConfig(): TracingConfig | null {
  return null;
}

export function makeTracingLayer(config: TracingConfig | null, resource: TracingResource) {
  void config;
  void resource;
  return Layer.empty;
}

export const tracingLayer = Layer.empty;

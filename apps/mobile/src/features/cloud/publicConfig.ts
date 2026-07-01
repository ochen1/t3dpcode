import * as Schema from "effect/Schema";

export class CloudPublicConfigMissingError extends Schema.TaggedErrorClass<CloudPublicConfigMissingError>()(
  "CloudPublicConfigMissingError",
  {
    key: Schema.Literal("T3CODE_CLERK_JWT_TEMPLATE"),
  },
) {
  override get message(): string {
    return `${this.key} is not configured.`;
  }
}

export interface CloudPublicConfig {
  readonly clerk: {
    readonly publishableKey: string | null;
    readonly jwtTemplate: string | null;
  };
  readonly relay: {
    readonly url: string | null;
  };
  readonly observability: {
    readonly tracesUrl: string | null;
    readonly tracesDataset: string | null;
    readonly tracesToken: string | null;
  };
}

export function resolveCloudPublicConfig(_extra?: unknown) {
  return {
    clerk: {
      publishableKey: null,
      jwtTemplate: null,
    },
    relay: {
      url: null,
    },
    observability: {
      tracesUrl: null,
      tracesDataset: null,
      tracesToken: null,
    },
  } satisfies CloudPublicConfig;
}

export function hasCloudPublicConfig(): boolean {
  return false;
}

export function hasTracingPublicConfig(_config?: CloudPublicConfig): false {
  return false;
}

export function resolveRelayClerkTokenOptions(): never {
  throw new CloudPublicConfigMissingError({ key: "T3CODE_CLERK_JWT_TEMPLATE" });
}

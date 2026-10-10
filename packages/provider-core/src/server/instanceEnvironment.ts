import type { ProviderInstanceEnvironment } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";

import { expandHomePath } from "./pathExpansion.ts";

export const mergeProviderInstanceEnvironment = Effect.fn(function* (
  environment: ProviderInstanceEnvironment | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
) {
  const next: NodeJS.ProcessEnv = { ...baseEnv };
  delete next.XPC_FLAGS;
  delete next.XPC_SERVICE_NAME;

  if (!environment || environment.length === 0) {
    return next;
  }

  const home = yield* HostProcess.HomeDirectory;
  for (const variable of environment) {
    if (variable.name === "XPC_FLAGS" || variable.name === "XPC_SERVICE_NAME") continue;
    // Child processes do not apply shell expansion to environment values.
    next[variable.name] =
      variable.name === "CODEX_HOME" || variable.name === "CLAUDE_CONFIG_DIR"
        ? expandHomePath(variable.value, home)
        : variable.value;
  }
  return next;
});

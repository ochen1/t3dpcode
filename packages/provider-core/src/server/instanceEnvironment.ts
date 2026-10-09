import type { ProviderInstanceEnvironment } from "@t3tools/contracts";

import { expandHomePath } from "./pathExpansion.ts";

export function mergeProviderInstanceEnvironment(
  environment: ProviderInstanceEnvironment | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...baseEnv };
  delete next.XPC_FLAGS;
  delete next.XPC_SERVICE_NAME;

  if (environment) {
    for (const variable of environment) {
      if (variable.name === "XPC_FLAGS" || variable.name === "XPC_SERVICE_NAME") continue;
      // Child processes do not apply shell expansion to environment values.
      next[variable.name] =
        variable.name === "CODEX_HOME" || variable.name === "CLAUDE_CONFIG_DIR"
          ? expandHomePath(variable.value)
          : variable.value;
    }
  }
  return next;
}

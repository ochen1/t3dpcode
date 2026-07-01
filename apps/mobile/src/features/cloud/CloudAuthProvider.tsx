import type { ReactNode } from "react";
import { setManagedRelaySession } from "@t3tools/client-runtime/relay";

import { appAtomRegistry } from "../../state/atom-registry";
import { setAgentAwarenessRelayTokenProvider } from "../agent-awareness/remoteRegistration";

let relayTokenProvider: (() => Promise<string | null>) | null = null;

export async function readCloudRelayToken(): Promise<string | null> {
  return relayTokenProvider?.() ?? null;
}

export function activateCloudRelayAccount(
  accountId: string,
  readClerkToken: () => Promise<string | null>,
): void {
  relayTokenProvider = readClerkToken;
  setManagedRelaySession(appAtomRegistry, {
    accountId,
    readClerkToken,
  });
  setAgentAwarenessRelayTokenProvider(readClerkToken);
}

export function deactivateCloudRelayAccount(): void {
  relayTokenProvider = null;
  setManagedRelaySession(appAtomRegistry, null);
  setAgentAwarenessRelayTokenProvider(null);
}

export function CloudAuthProvider({ children }: { readonly children: ReactNode }) {
  deactivateCloudRelayAccount();
  return children;
}

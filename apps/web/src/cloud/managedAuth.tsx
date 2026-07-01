import { setManagedRelaySession } from "@t3tools/client-runtime/relay";
import type { ReactNode } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";

let relayTokenProvider: (() => Promise<string | null>) | null = null;

export async function readManagedRelayClerkToken(): Promise<string | null> {
  return relayTokenProvider?.() ?? null;
}

export function deactivateManagedRelayAuthentication(): void {
  relayTokenProvider = null;
  setManagedRelaySession(appAtomRegistry, null);
}

export function activateManagedRelayAuthentication(
  accountId: string,
  readClerkToken: () => Promise<string | null>,
): void {
  relayTokenProvider = readClerkToken;
  setManagedRelaySession(appAtomRegistry, {
    accountId,
    readClerkToken,
  });
}

export function ManagedRelayAuthProvider({ children }: { readonly children: ReactNode }) {
  deactivateManagedRelayAuthentication();
  return children;
}

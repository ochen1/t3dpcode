import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";

import { handleAgentBrowserNotificationShellSnapshot } from "../agentBrowserNotifications";
import { useEnvironments } from "../state/environments";
import { environmentSnapshotAtom } from "../state/shell";

export function AgentBrowserNotificationObserver() {
  const { environments } = useEnvironments();

  return (
    <>
      {environments.map((environment) => (
        <EnvironmentAgentBrowserNotificationObserver
          key={environment.environmentId}
          environmentId={environment.environmentId}
        />
      ))}
    </>
  );
}

function EnvironmentAgentBrowserNotificationObserver(props: {
  readonly environmentId: EnvironmentId;
}) {
  const snapshot = useAtomValue(environmentSnapshotAtom(props.environmentId));

  useEffect(() => {
    if (snapshot === null) {
      return;
    }
    handleAgentBrowserNotificationShellSnapshot(snapshot, props.environmentId);
  }, [props.environmentId, snapshot]);

  return null;
}

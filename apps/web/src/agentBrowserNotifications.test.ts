import { EnvironmentId, ThreadId, TurnId, type OrchestrationSession } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  buildAgentThreadNotificationUrl,
  createAgentBrowserNotificationState,
  observeAgentThreadNotificationState,
} from "./agentBrowserNotifications";

const environmentId = EnvironmentId.make("env-1");
const threadId = ThreadId.make("thread-1");
const turnId = TurnId.make("turn-1");

function makeSession(
  status: OrchestrationSession["status"],
  activeTurnId: TurnId | null,
): OrchestrationSession {
  return {
    threadId,
    status,
    providerName: "codex",
    runtimeMode: "full-access",
    activeTurnId,
    lastError: status === "error" ? "boom" : null,
    updatedAt: "2026-05-14T00:00:00.000Z",
  };
}

describe("agentBrowserNotifications", () => {
  it("notifies when an observed running turn becomes ready", () => {
    const state = createAgentBrowserNotificationState();

    expect(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId,
          title: "Fix notification routing",
          session: makeSession("running", turnId),
          latestTurn: null,
        },
        state,
      ),
    ).toBeNull();

    expect(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId,
          title: "Fix notification routing",
          session: makeSession("ready", null),
          latestTurn: null,
        },
        state,
      ),
    ).toEqual({
      environmentId,
      threadId,
      turnId,
      outcome: "completed",
      title: "Fix notification routing",
      providerName: "codex",
    });
  });

  it("notifies when an observed running turn fails", () => {
    const state = createAgentBrowserNotificationState();

    observeAgentThreadNotificationState(
      {
        environmentId,
        threadId,
        title: "Fix notification routing",
        session: makeSession("running", turnId),
        latestTurn: null,
      },
      state,
    );

    expect(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId,
          title: "Fix notification routing",
          session: makeSession("error", null),
          latestTurn: null,
        },
        state,
      )?.outcome,
    ).toBe("failed");
  });

  it("does not notify for a terminal session that was never observed running", () => {
    const state = createAgentBrowserNotificationState();

    expect(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId,
          title: "Already done",
          session: makeSession("ready", null),
          latestTurn: { turnId },
        },
        state,
      ),
    ).toBeNull();
  });

  it("clears observed turns on stopped sessions", () => {
    const state = createAgentBrowserNotificationState();

    observeAgentThreadNotificationState(
      {
        environmentId,
        threadId,
        title: "Stopped thread",
        session: makeSession("running", turnId),
        latestTurn: null,
      },
      state,
    );
    observeAgentThreadNotificationState(
      {
        environmentId,
        threadId,
        title: "Stopped thread",
        session: makeSession("stopped", null),
        latestTurn: null,
      },
      state,
    );

    expect(
      observeAgentThreadNotificationState(
        {
          environmentId,
          threadId,
          title: "Stopped thread",
          session: makeSession("ready", null),
          latestTurn: null,
        },
        state,
      ),
    ).toBeNull();
  });

  it("builds the browser route for a completed thread", () => {
    expect(buildAgentThreadNotificationUrl(environmentId, threadId)).toBe("/env-1/thread-1");
  });
});

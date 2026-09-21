import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, TurnId, ProviderInstanceId } from "@t3tools/contracts";
import {
  collectAgentCompletionSnapshot,
  hasNewAgentCompletion,
  type AgentCompletionThreadSnapshot,
} from "./agentCompletionSound";

const completedAt = "2026-09-21T12:00:00.000Z";
function thread(
  status: "running" | "ready" | "error",
  overrides: Partial<AgentCompletionThreadSnapshot> = {},
): AgentCompletionThreadSnapshot {
  return {
    environmentId: EnvironmentId.make("env-1"),
    id: ThreadId.make("thread-1"),
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    backgroundLiveness: undefined,
    session: {
      threadId: ThreadId.make("thread-1"),
      status,
      providerName: "Codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      runtimeMode: "full-access",
      activeTurnId: status === "running" ? TurnId.make("turn-1") : null,
      lastError: null,
      updatedAt: completedAt,
    },
    latestTurn: {
      turnId: TurnId.make("turn-1"),
      state: status === "running" ? "running" : "completed",
      requestedAt: completedAt,
      startedAt: completedAt,
      completedAt: status === "running" ? null : completedAt,
      assistantMessageId: null,
    },
    ...overrides,
  };
}

function changed(before: AgentCompletionThreadSnapshot[], after: AgentCompletionThreadSnapshot[]) {
  return hasNewAgentCompletion(
    collectAgentCompletionSnapshot(before),
    collectAgentCompletionSnapshot(after),
  );
}

describe("agent completion sound detection", () => {
  it("sounds only when a tracked working thread becomes ready with a completed turn", () => {
    expect(changed([thread("running")], [thread("ready")])).toBe(true);
    expect(changed([], [thread("ready")])).toBe(false);
    expect(changed([thread("ready")], [thread("ready")])).toBe(false);
  });

  it("waits for the session after a turn or subagent completes", () => {
    const working = thread("running");
    const turnCompleted = thread("running", { latestTurn: thread("ready").latestTurn });
    expect(changed([working], [turnCompleted])).toBe(false);
    expect(changed([turnCompleted], [thread("ready")])).toBe(true);
  });

  it("waits for background agents after the session becomes ready", () => {
    const background = thread("ready", { backgroundLiveness: "working" });
    expect(changed([thread("running")], [background])).toBe(false);
    expect(changed([background], [thread("ready")])).toBe(true);
  });

  it("ignores completion timestamp changes while the thread is already ready", () => {
    const latestTurn = thread("ready").latestTurn!;
    expect(
      changed(
        [thread("ready")],
        [
          thread("ready", {
            latestTurn: {
              ...latestTurn,
              turnId: TurnId.make("turn-2"),
              completedAt: "2026-09-21T12:05:00.000Z",
            },
          }),
        ],
      ),
    ).toBe(false);
  });

  it("does not sound for approval, input, monitoring, or failure states", () => {
    for (const next of [
      thread("ready", { hasPendingApprovals: true }),
      thread("ready", { hasPendingUserInput: true }),
      thread("ready", { backgroundLiveness: "monitoring" }),
      thread("error"),
    ])
      expect(changed([thread("running")], [next])).toBe(false);
  });

  it("ignores interrupted or failed turns", () => {
    for (const state of ["interrupted", "error"] as const) {
      expect(
        changed(
          [thread("running")],
          [
            thread("ready", {
              latestTurn: { ...thread("ready").latestTurn!, state },
            }),
          ],
        ),
      ).toBe(false);
    }
  });

  it("keeps identical thread IDs in different environments separate", () => {
    expect(
      changed(
        [thread("running")],
        [
          thread("ready", {
            environmentId: EnvironmentId.make("env-2"),
          }),
        ],
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, RunId, ProviderInstanceId } from "@t3tools/contracts";
import {
  collectAgentCompletionSnapshot,
  hasNewAgentCompletion,
  type AgentCompletionThreadSnapshot,
} from "./agentCompletionSound";

const completedAt = "2026-09-21T12:00:00.000Z";
function thread(
  status: "running" | "completed" | "failed",
  overrides: Partial<AgentCompletionThreadSnapshot> = {},
): AgentCompletionThreadSnapshot {
  return {
    environmentId: EnvironmentId.make("env-1"),
    id: ThreadId.make("thread-1"),
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    runtime: {
      status,
      activeRunId: status === "running" ? RunId.make("run-1") : null,
      providerName: "codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      lastError: null,
      updatedAt: completedAt,
    },
    latestRun: {
      runId: RunId.make("run-1"),
      status: status === "running" ? "running" : "completed",
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
  it("sounds only when tracked work finishes", () => {
    expect(changed([thread("running")], [thread("completed")])).toBe(true);
    expect(changed([], [thread("completed")])).toBe(false);
    expect(changed([thread("completed")], [thread("completed")])).toBe(false);
  });
  it("waits for runtime and background work to finish after the run completes", () => {
    const working = thread("running", { latestRun: thread("completed").latestRun });
    expect(changed([thread("running")], [working])).toBe(false);
    expect(changed([working], [thread("completed")])).toBe(true);
  });
  it("does not sound for approval, input, monitoring, or failures", () => {
    const completed = thread("completed");
    for (const next of [
      thread("completed", { hasPendingApprovals: true }),
      thread("completed", { hasPendingUserInput: true }),
      thread("failed"),
      thread("completed", { runtime: { ...completed.runtime!, status: "idle" } }),
    ]) {
      expect(changed([thread("running")], [next])).toBe(false);
    }
  });
  it("ignores interrupted or failed runs", () => {
    for (const status of ["interrupted", "failed"] as const) {
      expect(
        changed(
          [thread("running")],
          [
            thread("completed", {
              latestRun: { ...thread("completed").latestRun!, status },
            }),
          ],
        ),
      ).toBe(false);
    }
  });
  it("keeps environments and removed threads separate", () => {
    expect(
      changed(
        [thread("running")],
        [thread("completed", { environmentId: EnvironmentId.make("env-2") })],
      ),
    ).toBe(false);
    expect(changed([thread("running")], [])).toBe(false);
  });
});

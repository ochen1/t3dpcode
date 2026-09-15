import { describe, expect, it } from "vite-plus/test";

import {
  collectAgentCompletionSnapshot,
  hasNewAgentCompletion,
  type AgentCompletionThreadSnapshot,
} from "./agentCompletionSound";

function thread(
  id: string,
  latestTurn: AgentCompletionThreadSnapshot["latestTurn"],
): AgentCompletionThreadSnapshot {
  return {
    environmentId: "env-1",
    id,
    latestTurn,
  };
}

function turn(
  state: string,
  options: {
    readonly turnId?: string;
    readonly completedAt?: string | null;
  } = {},
): NonNullable<AgentCompletionThreadSnapshot["latestTurn"]> {
  return {
    turnId: options.turnId ?? "turn-1",
    state,
    completedAt: options.completedAt ?? null,
  };
}

describe("agent completion sound detection", () => {
  it("tracks completed turns without treating initial completed threads as new", () => {
    const previous = collectAgentCompletionSnapshot([]);
    const next = collectAgentCompletionSnapshot([
      thread("thread-1", turn("completed", { completedAt: "2026-07-02T12:00:00.000Z" })),
    ]);

    expect(hasNewAgentCompletion(previous, next)).toBe(false);
  });

  it("detects a tracked thread transitioning to completed", () => {
    const previous = collectAgentCompletionSnapshot([thread("thread-1", turn("running"))]);
    const next = collectAgentCompletionSnapshot([
      thread("thread-1", turn("completed", { completedAt: "2026-07-02T12:00:00.000Z" })),
    ]);

    expect(hasNewAgentCompletion(previous, next)).toBe(true);
  });

  it("detects a newer completed turn on the same tracked thread", () => {
    const previous = collectAgentCompletionSnapshot([
      thread("thread-1", turn("completed", { completedAt: "2026-07-02T12:00:00.000Z" })),
    ]);
    const next = collectAgentCompletionSnapshot([
      thread(
        "thread-1",
        turn("completed", {
          turnId: "turn-2",
          completedAt: "2026-07-02T12:05:00.000Z",
        }),
      ),
    ]);

    expect(hasNewAgentCompletion(previous, next)).toBe(true);
  });

  it("ignores interrupted and failed turns", () => {
    const previous = collectAgentCompletionSnapshot([thread("thread-1", turn("running"))]);
    const interrupted = collectAgentCompletionSnapshot([
      thread("thread-1", turn("interrupted", { completedAt: "2026-07-02T12:00:00.000Z" })),
    ]);
    const failed = collectAgentCompletionSnapshot([
      thread("thread-1", turn("error", { completedAt: "2026-07-02T12:00:00.000Z" })),
    ]);

    expect(hasNewAgentCompletion(previous, interrupted)).toBe(false);
    expect(hasNewAgentCompletion(previous, failed)).toBe(false);
  });
});

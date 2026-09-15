import { describe, expect, it } from "vite-plus/test";

import { shouldShowComposerQueuedHeader } from "./ComposerQueuedHeader";

describe("shouldShowComposerQueuedHeader", () => {
  it("keeps queued turns visible when the mobile composer is collapsed", () => {
    expect(
      shouldShowComposerQueuedHeader({
        queuedTurnCount: 1,
        isComposerCollapsedMobile: true,
      }),
    ).toBe(true);
  });

  it("hides the header when the queue is empty", () => {
    expect(
      shouldShowComposerQueuedHeader({
        queuedTurnCount: 0,
        isComposerCollapsedMobile: false,
      }),
    ).toBe(false);
  });
});

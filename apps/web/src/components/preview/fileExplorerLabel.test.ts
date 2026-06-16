import { describe, expect, it } from "vitest";

import { revealInFileExplorerLabel } from "./fileExplorerLabel";

describe("revealInFileExplorerLabel", () => {
  it.each([
    ["MacIntel", "Reveal in Finder"],
    ["Win32", "Reveal in File Explorer"],
    ["Linux x86_64", "Reveal in Files"],
  ])("maps %s to %s", (platform, expected) => {
    expect(revealInFileExplorerLabel(platform)).toBe(expected);
  });
});

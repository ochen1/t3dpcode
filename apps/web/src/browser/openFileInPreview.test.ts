import { describe, expect, it } from "vite-plus/test";

import { isBrowserPreviewFile, isBrowserPreviewImageFile } from "./previewFilePaths";

describe("isBrowserPreviewFile", () => {
  it.each(["index.html", "report.pdf", "screenshots/result.PNG", "image.webp?cache=1"])(
    "recognizes previewable workspace asset %s",
    (path) => {
      expect(isBrowserPreviewFile(path)).toBe(true);
    },
  );

  it.each(["README.md", "src/index.ts", "image.png.ts"])(
    "rejects non-preview workspace asset %s",
    (path) => {
      expect(isBrowserPreviewFile(path)).toBe(false);
    },
  );

  it("distinguishes inline image previews from browser document previews", () => {
    expect(isBrowserPreviewImageFile("screenshots/result.PNG")).toBe(true);
    expect(isBrowserPreviewImageFile("report.pdf")).toBe(false);
    expect(isBrowserPreviewImageFile("index.html")).toBe(false);
  });
});

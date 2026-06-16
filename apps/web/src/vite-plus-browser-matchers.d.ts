import type { ExpectPollOptions } from "vitest";
import type { Locator } from "@vitest/browser/context";

declare module "vitest" {
  interface ExpectStatic {
    element: (
      element: HTMLElement | SVGElement | null | Locator,
      options?: ExpectPollOptions,
    ) => any;
  }
}

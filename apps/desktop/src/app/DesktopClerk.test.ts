import { describe, expect, it } from "vite-plus/test";

import * as DesktopClerk from "./DesktopClerk.ts";

describe("DesktopClerk", () => {
  it("keeps Clerk disabled", () => {
    expect(DesktopClerk.desktopClerkFrontendApiHostname).toBeUndefined();
    expect(DesktopClerk.resolveDesktopClerkFrontendApiHostname("pk_test_unused")).toBeUndefined();
    expect(DesktopClerk.createDesktopClerkBridge("/tmp/t3-state", true)).toBeNull();
  });
});

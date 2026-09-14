import { describe, expect, it } from "vitest";

import { headfullPreviewOutputRouteDir } from "../lib/render-headfull-page-preview.js";

describe("headfullPreviewOutputRouteDir", () => {
  it("sanitizes component id for output route dir", () => {
    expect(headfullPreviewOutputRouteDir("local:site-header")).toBe(
      "headfull/local_site-header",
    );
  });

  it("isolates props variants with hash suffix", () => {
    expect(headfullPreviewOutputRouteDir("local:site-header", "abc123")).toBe(
      "headfull/local_site-header/abc123",
    );
  });
});

import { describe, expect, it } from "vitest";

import { parseOpenDeutschActivityUrl } from "../src/main/deep-link.js";

describe("Open Deutsch URL scheme", () => {
  it("accepts only an opaque prepared activity identifier", () => {
    expect(
      parseOpenDeutschActivityUrl("open-deutsch://activity/activity_0123456789abcdef"),
    ).toEqual({
      route: "activity",
      activityId: "activity_0123456789abcdef",
    });
  });

  it("rejects arbitrary paths, queries, encoded traversal, and malformed IDs", () => {
    for (const value of [
      "https://activity/activity_0123456789abcdef",
      "open-deutsch://settings/activity_0123456789abcdef",
      "open-deutsch://activity/activity_0123456789abcdef?next=settings",
      "open-deutsch://activity/activity_%2e%2e%2fsettings",
      "open-deutsch://activity/not-an-activity",
      "open-deutsch://activity/activity_0123456789abcdef/extra",
    ]) {
      expect(() => parseOpenDeutschActivityUrl(value)).toThrow("OD_HANDOFF_URL_INVALID");
    }
  });
});

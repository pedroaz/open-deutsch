import { describe, expect, it } from "vitest";

import { productionServerIdentity } from "../src/index.js";

describe("production MCP server identity", () => {
  it("uses the stable Open Deutsch product name and release version", () => {
    expect(productionServerIdentity).toEqual({ name: "open-deutsch", version: "0.1.0" });
    expect(Object.isFrozen(productionServerIdentity)).toBe(true);
  });
});

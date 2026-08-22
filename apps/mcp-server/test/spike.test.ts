import path from "node:path";

import { describe, expect, it } from "vitest";

import { isContained } from "../src/spike.js";

describe("MCP spike path boundary", () => {
  it("accepts only descendants of the disposable data root", () => {
    const dataRoot = path.join(path.parse(process.cwd()).root, "tmp", "owned-data");
    expect(isContained(dataRoot, path.join(dataRoot, "state.json"))).toBe(true);
    expect(isContained(dataRoot, dataRoot)).toBe(false);
    expect(isContained(dataRoot, path.join(dataRoot, "..", "learner-data", "state.json"))).toBe(
      false,
    );
    expect(isContained(dataRoot, path.parse(dataRoot).root)).toBe(false);
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  boundaryUnion,
  boundarySurfaces,
  parseBoundary,
  safeParseBoundary,
  strictBoundaryObject,
  toBoundaryJsonSchema,
  validationIssues,
  z,
  type BoundarySurface,
} from "../src/index.js";

const probeSchema = strictBoundaryObject({
  schemaVersion: z.literal(1),
  surface: z.enum(boundarySurfaces),
  value: z.string().trim().min(1),
});

describe("shared runtime schema system", () => {
  it.each(boundarySurfaces)("validates the %s boundary", (surface) => {
    const result = parseBoundary(probeSchema, { schemaVersion: 1, surface, value: " gut " });
    expect(result).toEqual({ schemaVersion: 1, surface, value: "gut" });
    expectTypeOf(result.surface).toEqualTypeOf<BoundarySurface>();
  });

  it("rejects unknown keys at strict boundaries", () => {
    const result = safeParseBoundary(probeSchema, {
      schemaVersion: 1,
      surface: "ipc",
      value: "gut",
      rawToken: "must-not-cross",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(validationIssues(result.error)).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", path: [] }),
    ]);
  });

  it("projects a closed JSON Schema for MCP and AI structured outputs", () => {
    const jsonSchema = toBoundaryJsonSchema(probeSchema);
    expect(jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "surface", "value"],
    });
  });

  it("fails closed when a runtime transform cannot be represented as JSON Schema", () => {
    const schema = strictBoundaryObject({
      value: z.string().transform((value) => value.length),
    });
    expect(() => toBoundaryJsonSchema(schema)).toThrow();
  });

  it("rejects unowned object schemas that strip unknown keys", () => {
    const unowned = z.object({ id: z.string() });
    expect(unowned.safeParse({ id: "ok", unexpected: true })).toEqual({
      success: true,
      data: { id: "ok" },
    });
    expect(() =>
      safeParseBoundary(unowned as unknown as Parameters<typeof safeParseBoundary>[0], {
        id: "ok",
        unexpected: true,
      }),
    ).toThrow("OD_BOUNDARY_SCHEMA_UNOWNED");
  });

  it("rejects unowned members when composing a boundary union", () => {
    const unowned = z.strictObject({ id: z.string() });
    expect(() =>
      boundaryUnion([probeSchema, unowned as unknown as Parameters<typeof boundaryUnion>[0][1]]),
    ).toThrow("OD_BOUNDARY_SCHEMA_UNOWNED");
  });

  it("preserves nested issue paths for later safe error projection", () => {
    const nested = strictBoundaryObject({
      items: z.array(z.strictObject({ count: z.int().positive() })),
    });
    const result = nested.safeParse({ items: [{ count: 0 }] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(validationIssues(result.error)[0]?.path).toEqual(["<field>", 0, "<field>"]);
  });

  it("does not project raw validation messages or values", () => {
    const privateValue = "private learner text";
    const result = z
      .string()
      .refine(() => false, { message: privateValue })
      .safeParse(privateValue);
    expect(result.success).toBe(false);
    if (result.success) return;
    const projected = JSON.stringify(validationIssues(result.error));
    expect(projected).not.toContain(privateValue);
    expect(projected).toBe('[{"code":"custom","path":[]}]');
  });

  it("redacts untrusted object keys from validation paths", () => {
    const privateKey = `PRIVATE_LEARNER_TEXT_${"x".repeat(4_096)}`;
    const result = z.record(z.string(), z.number()).safeParse({ [privateKey]: "bad" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const projected = JSON.stringify(validationIssues(result.error));
    expect(projected).not.toContain(privateKey);
    expect(projected.length).toBeLessThan(100);
  });
});

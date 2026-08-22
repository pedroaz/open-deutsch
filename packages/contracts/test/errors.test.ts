import { describe, expect, it } from "vitest";

import { createDeterministicContractFactory } from "../../../tests/support/contract-factories.js";
import {
  errorDefinitions,
  localizedErrorMessage,
  openDeutschErrorSchema,
  safeErrorMessages,
  toBoundaryJsonSchema,
} from "../src/index.js";

const factory = createDeterministicContractFactory();

function errorFor(kind: keyof typeof errorDefinitions) {
  const definition = errorDefinitions[kind];
  return {
    schemaVersion: 1 as const,
    kind,
    ...definition,
    reference: {
      code: definition.code,
      correlationId: factory.nextId("correlation"),
      runId: factory.nextId("run"),
      sessionId: factory.nextId("session"),
      occurredAt: factory.nextInstant(),
    },
  };
}

describe("shared error model", () => {
  it("distinguishes every required category with unique codes and message keys", () => {
    expect(Object.keys(errorDefinitions)).toHaveLength(14);
    expect(new Set(Object.values(errorDefinitions).map(({ code }) => code)).size).toBe(14);
    expect(new Set(Object.values(errorDefinitions).map(({ messageKey }) => messageKey)).size).toBe(
      14,
    );
    for (const kind of Object.keys(errorDefinitions) as (keyof typeof errorDefinitions)[]) {
      expect(openDeutschErrorSchema.safeParse(errorFor(kind)).success).toBe(true);
    }
  });

  it("rejects mismatched kind, diagnostic code, message key, and log reference", () => {
    const value = errorFor("validation");
    for (const mutation of [
      { ...value, code: errorDefinitions.database.code },
      { ...value, messageKey: errorDefinitions.database.messageKey },
      { ...value, reference: { ...value.reference, code: errorDefinitions.database.code } },
    ]) {
      expect(openDeutschErrorSchema.safeParse(mutation).success).toBe(false);
    }
  });

  it("rejects unknown details instead of carrying learner or protocol data", () => {
    expect(
      openDeutschErrorSchema.safeParse({
        ...errorFor("model-output"),
        details: "PRIVATE_LEARNER_TEXT",
      }).success,
    ).toBe(false);
  });

  it("provides complete static English and German safe messages", () => {
    for (const kind of Object.keys(errorDefinitions) as (keyof typeof errorDefinitions)[]) {
      expect(localizedErrorMessage(kind, "en")).toBe(safeErrorMessages.en[kind]);
      expect(localizedErrorMessage(kind, "de")).toBe(safeErrorMessages.de[kind]);
      expect(safeErrorMessages.en[kind]).not.toMatch(/\{.+\}/u);
      expect(safeErrorMessages.de[kind]).not.toMatch(/\{.+\}/u);
    }
  });

  it("projects a closed structured error JSON Schema", () => {
    const jsonSchema = toBoundaryJsonSchema(openDeutschErrorSchema);
    expect(jsonSchema.anyOf).toHaveLength(14);
    const serialized = JSON.stringify(jsonSchema);
    expect(serialized).toContain('"const":"validation"');
    expect(serialized).toContain('"const":"errors.validation"');
    expect(serialized.match(/"const":"OD_VALIDATION_FAILED"/gu)).toHaveLength(2);
    for (const variant of jsonSchema.anyOf ?? []) {
      expect(variant.type).toBe("object");
      expect(variant.additionalProperties).toBe(false);
      expect(variant.required).toEqual([
        "schemaVersion",
        "kind",
        "code",
        "messageKey",
        "reference",
      ]);
    }
  });
});

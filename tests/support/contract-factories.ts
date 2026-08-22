import {
  identifierPrefixes,
  identifierSchemas,
  utcInstantSchema,
  type IdentifierFor,
  type IdentifierKind,
  type UtcInstant,
} from "../../packages/contracts/src/index.js";

export interface DeterministicContractFactory {
  nextId<Kind extends IdentifierKind>(kind: Kind): IdentifierFor<Kind>;
  nextInstant(): UtcInstant;
}

export function createDeterministicContractFactory(
  startSequence = 1,
  startInstant = "2026-01-01T00:00:00.000Z",
): DeterministicContractFactory {
  if (!Number.isSafeInteger(startSequence) || startSequence < 0) {
    throw new Error("Contract identifier sequence must be a non-negative safe integer.");
  }
  const canonicalStartInstant = utcInstantSchema.parse(startInstant);
  const startMilliseconds = Date.parse(canonicalStartInstant);
  let sequence = startSequence;
  let instantOffset = 0;
  return {
    nextId(kind) {
      if (!Number.isSafeInteger(sequence)) {
        throw new Error("Contract identifier sequence is exhausted.");
      }
      const token = sequence.toString(36).padStart(16, "0");
      sequence += 1;
      return identifierSchemas[kind].parse(`${identifierPrefixes[kind]}_${token}`) as IdentifierFor<
        typeof kind
      >;
    },
    nextInstant() {
      const instant = new Date(startMilliseconds + instantOffset).toISOString();
      instantOffset += 1_000;
      return utcInstantSchema.parse(instant);
    },
  };
}

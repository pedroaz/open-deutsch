export interface TestClock {
  now(): Date;
}

export function createFixedClock(instant: string | Date): TestClock {
  const milliseconds = new Date(instant).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("A valid fixed instant is required.");
  return {
    now: () => new Date(milliseconds),
  };
}

export interface SequenceIdFactory {
  next(prefix: string): string;
}

export function createSequenceIdFactory(start = 1): SequenceIdFactory {
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new Error("The starting identifier sequence must be a non-negative safe integer.");
  }
  let sequence = start;
  return {
    next(prefix) {
      if (!/^[a-z][a-z0-9-]*$/u.test(prefix)) {
        throw new Error("Identifier prefixes must use lowercase kebab-case.");
      }
      const value = `${prefix}-${String(sequence).padStart(4, "0")}`;
      sequence += 1;
      return value;
    },
  };
}

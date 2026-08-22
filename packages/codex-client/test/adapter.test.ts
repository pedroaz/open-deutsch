import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appServerOperationStartSchema,
  correlationIdSchema,
  type AppServerOperationFor,
} from "@open-deutsch/contracts";
import { OpenDeutschAppServerClient } from "../src/index.js";

const executable = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

async function client(
  scenario = "standard",
  account: { planType: string } | null = { planType: "plus" },
  extra: Record<string, unknown> = {},
) {
  const root = await mkdtemp("/tmp/open-deutsch-adapter-");
  roots.push(root);
  const controlPath = path.join(root, "control.json");
  await writeFile(controlPath, `${JSON.stringify({ scenario, account, ...extra })}\n`, {
    mode: 0o600,
  });
  const subject = new OpenDeutschAppServerClient({
    forbiddenRoots: [process.cwd(), root],
    presentDeviceCode: () => {},
    processOptions: {
      executable,
      environment: { ...process.env, OPEN_DEUTSCH_FAKE_CONTROL_FILE: controlPath },
      initializeTimeoutMilliseconds: 1_000,
      requestTimeoutMilliseconds: 1_000,
      shutdownGraceMilliseconds: 200,
    },
  });
  return { controlPath, subject };
}

const operation: AppServerOperationFor<"contextual-help"> = appServerOperationStartSchema.parse({
  operationId: "correlation_0123456789abcdef",
  submissionId: "correlation_abcdef0123456789",
  dataRootGeneration: 1,
  modelSelection: {
    model: { selection: "exact" as const, modelId: "gpt-fake" },
    effort: { selection: "exact" as const, effortId: "medium" },
  },
  input: {
    kind: "contextual-help" as const,
    activityId: "activity_0123456789abcdefgh",
    selectedText: "PRIVATE_LEARNER_TEXT",
    containingSentence: "Ich fahre mit dem Bus.",
    question: "Warum Dativ?",
    calibration: {
      approximateLevel: "A2" as const,
      explanationLanguage: "en" as const,
      teachingProfile: "strict-corrector" as const,
    },
    relevantMistakes: [],
    priorTurns: [],
  },
}) as AppServerOperationFor<"contextual-help">;

describe("Open Deutsch App Server adapter", () => {
  it("projects an unexpected owned exit as failed without an automatic restart", async () => {
    const { subject } = await client("exit");
    await expect(subject.start()).resolves.toMatchObject({ lifecycle: { status: "failed" } });
    await expect(subject.snapshot()).resolves.toMatchObject({ lifecycle: { status: "failed" } });
    await subject.shutdown();
  });

  it("restores safe state and executes once for duplicate renderer submissions", async () => {
    const { subject } = await client();
    const events: unknown[] = [];
    subject.subscribe((event) => events.push(event));
    const snapshot = await subject.start();
    expect(snapshot.account).toEqual({ status: "signed-in", planType: "plus" });
    expect(snapshot.models.runtimeDefaultModelId).toBe("gpt-fake");
    const [first, duplicate] = await Promise.all([
      subject.runOperation<"contextual-help">(operation),
      subject.runOperation<"contextual-help">(operation),
    ]);
    expect(first.output.answer).toContain("dative");
    expect(duplicate).toEqual(first);
    expect(JSON.stringify(events)).not.toContain("PRIVATE_LEARNER_TEXT");
    expect(events).toContainEqual(
      expect.objectContaining({ event: "operation-finished", operationId: operation.operationId }),
    );
    await subject.shutdown();
  });

  it("rejects an unavailable exact effort before a model request", async () => {
    const { subject } = await client();
    await subject.start();
    await expect(
      subject.runOperation({
        ...operation,
        operationId: correlationIdSchema.parse("correlation_1111111111111111"),
        submissionId: correlationIdSchema.parse("correlation_2222222222222222"),
        modelSelection: {
          model: { selection: "exact", modelId: "gpt-fake" },
          effort: { selection: "exact", effortId: "pro" },
        },
      }),
    ).rejects.toThrow("OD_APP_SERVER_FAILED");
    await subject.shutdown();
  });

  it("retries explicitly with retained input and a fresh request after output failure", async () => {
    const { controlPath, subject } = await client("invalid-output");
    await subject.start();
    await expect(subject.runOperation(operation)).rejects.toThrow("OD_MODEL_OUTPUT_INVALID");
    await writeFile(
      controlPath,
      `${JSON.stringify({ scenario: "standard", account: { planType: "plus" } })}\n`,
      { mode: 0o600 },
    );
    const result = await subject.retryOperation({
      previousOperationId: operation.operationId,
      operationId: correlationIdSchema.parse("correlation_3333333333333333"),
      submissionId: correlationIdSchema.parse("correlation_4444444444444444"),
    });
    if (!("answer" in result.output) || typeof result.output.answer !== "string") {
      throw new Error("Expected contextual-help output");
    }
    expect(result.output.answer).toContain("dative");
    expect(result.operationId).toBe(correlationIdSchema.parse("correlation_3333333333333333"));
    await subject.shutdown();
  });

  it("runs managed device login, restores safe state, and logs out through the fake process", async () => {
    const { subject } = await client("standard", null);
    const events: unknown[] = [];
    subject.subscribe((event) => events.push(event));
    await expect(subject.start()).resolves.toMatchObject({ account: { status: "signed-out" } });
    const loginId = await subject.startManagedLogin("device-code");
    await vi.waitFor(() => {
      expect(events).toContainEqual(
        expect.objectContaining({
          event: "account-login-changed",
          loginId,
          state: { status: "complete" },
        }),
      );
    });
    await expect(subject.snapshot()).resolves.toMatchObject({
      account: { status: "signed-in", planType: "plus" },
    });
    await expect(subject.logout()).resolves.toEqual({ status: "signed-out" });
    expect(JSON.stringify(events)).not.toMatch(/authUrl|runtime-login|accessToken|email/iu);
    await subject.shutdown();
  });

  it("projects authoritative rate limiting without guessing the reached bucket", async () => {
    const rateLimitsResult = {
      rateLimits: null,
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          planType: "plus",
          primary: { usedPercent: 100, resetsAt: 1_900_000_000 },
          secondary: null,
        },
      },
    };
    const { subject } = await client("rate-limit", { planType: "plus" }, { rateLimitsResult });
    const states: unknown[] = [];
    subject.subscribe((event) => states.push(event));
    await subject.start();
    await expect(
      subject.runOperation<"contextual-help">({
        ...operation,
        operationId: correlationIdSchema.parse("correlation_5555555555555555"),
        submissionId: correlationIdSchema.parse("correlation_6666666666666666"),
      }),
    ).rejects.toThrow("OD_RATE_LIMITED");
    expect(
      states.some((event) => {
        if (typeof event !== "object" || event === null || !("state" in event)) return false;
        const state = event.state;
        return (
          typeof state === "object" &&
          state !== null &&
          "status" in state &&
          state.status === "rate-limited" &&
          "reached" in state &&
          state.reached === "primary" &&
          "retryAt" in state &&
          state.retryAt === 1_900_000_000
        );
      }),
    ).toBe(true);
    expect(states).toContainEqual(
      expect.objectContaining({
        event: "operation-finished",
        outcome: {
          status: "rate-limited",
          reached: "primary",
          retryAt: 1_900_000_000,
        },
      }),
    );
    await subject.shutdown();
  });

  it("interrupts an active turn and settles cancellation exactly once", async () => {
    const { subject } = await client("hung-turn");
    const events: unknown[] = [];
    subject.subscribe((event) => events.push(event));
    await subject.start();
    const running = subject.runOperation<"contextual-help">({
      ...operation,
      operationId: correlationIdSchema.parse("correlation_7777777777777777"),
      submissionId: correlationIdSchema.parse("correlation_8888888888888888"),
    });
    await vi.waitFor(() => {
      expect(JSON.stringify(events)).toContain('"stage":"running"');
    });
    await subject.cancelOperation(correlationIdSchema.parse("correlation_7777777777777777"));
    await expect(running).rejects.toThrow("OD_CANCELLED");
    expect(
      events.filter(
        (event) =>
          typeof event === "object" &&
          event !== null &&
          "event" in event &&
          event.event === "operation-finished",
      ),
    ).toHaveLength(1);
    await subject.shutdown();
  });
});

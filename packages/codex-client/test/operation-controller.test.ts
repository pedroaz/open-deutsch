import { describe, expect, it, vi } from "vitest";

import {
  OperationController,
  OperationRateLimitedError,
  type ExecuteContext,
} from "../src/operation-controller.js";

describe("App Server operation controller", () => {
  it("deduplicates concurrent submissions and emits one terminal event", async () => {
    const controller = new OperationController<{ learnerText: string }, { ok: true }>();
    const events: string[] = [];
    controller.subscribe((event) => events.push(`${event.operationId}:${event.stage}`));
    const execute = vi.fn((_input: { learnerText: string }, context: ExecuteContext) => {
      context.validating();
      return Promise.resolve({ ok: true as const });
    });
    const first = controller.start({
      submissionId: "submission-1",
      operationId: "operation-1",
      input: { learnerText: "Ich lerne." },
      execute,
    });
    const duplicate = controller.start({
      submissionId: "submission-1",
      operationId: "operation-forged",
      input: { learnerText: "Ich lerne." },
      execute,
    });
    expect(first.accepted).toBe("started");
    expect(duplicate).toMatchObject({ accepted: "replayed", operationId: "operation-1" });
    await expect(first.completion).resolves.toEqual({ status: "succeeded", output: { ok: true } });
    await expect(duplicate.completion).resolves.toEqual({
      status: "succeeded",
      output: { ok: true },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.endsWith(":succeeded"))).toHaveLength(1);
    expect(() =>
      controller.start({
        submissionId: "submission-1",
        operationId: "operation-2",
        input: { learnerText: "Different private input" },
        execute,
      }),
    ).toThrow("OD_OPERATION_SUBMISSION_CONFLICT");
  });

  it("settles cancellation before execution and never emits success", async () => {
    const controller = new OperationController<{ value: number }, number>();
    const events: string[] = [];
    controller.subscribe((event) => events.push(event.stage));
    const started = controller.start({
      submissionId: "submission-cancel",
      operationId: "operation-cancel",
      input: { value: 1 },
      execute: () => Promise.resolve(2),
    });
    expect(controller.cancel("operation-cancel")).toBe(true);
    await expect(started.completion).resolves.toEqual({ status: "cancelled" });
    expect(controller.cancel("operation-cancel")).toBe(false);
    expect(events.filter((stage) => terminal(stage))).toEqual(["cancelled"]);
  });

  it("retries explicitly with retained input and a new operation", async () => {
    const controller = new OperationController<{ learnerText: string }, string>();
    const first = controller.start({
      submissionId: "submission-rate-limit",
      operationId: "operation-rate-limit",
      input: { learnerText: "Ich lerne." },
      execute: () => Promise.reject(new OperationRateLimitedError()),
    });
    await expect(first.completion).resolves.toEqual({ status: "rate-limited" });
    const retry = controller.retry({
      previousOperationId: "operation-rate-limit",
      submissionId: "submission-retry",
      operationId: "operation-retry",
      retain: (input) => ({ ...input, learnerText: input.learnerText }),
      execute: (input) => Promise.resolve(input.learnerText),
    });
    await expect(retry.completion).resolves.toEqual({ status: "succeeded", output: "Ich lerne." });
  });
});

function terminal(stage: string): boolean {
  return ["succeeded", "cancelled", "rate-limited", "failed"].includes(stage);
}

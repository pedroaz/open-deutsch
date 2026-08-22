import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { JsonRpcTransport } from "../src/index.js";

function harness(options: { maximumHistoryEntries?: number; maximumLineBytes?: number } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const sent: Record<string, unknown>[] = [];
  input.on("data", (chunk) => {
    for (const line of String(chunk).trim().split("\n")) {
      if (line) sent.push(JSON.parse(line) as Record<string, unknown>);
    }
  });
  const fatal = vi.fn();
  const notifications = vi.fn();
  const transport = new JsonRpcTransport({
    input,
    output,
    defaultTimeoutMilliseconds: 25,
    onFatalError: fatal,
    onNotification: notifications,
    ...options,
  });
  return { fatal, input, notifications, output, sent, transport };
}

describe("bounded App Server JSONL transport", () => {
  it("correlates out-of-order requests without retaining protocol payloads", async () => {
    const { output, sent, transport } = harness();
    const first = transport.request("first", { learnerText: "private-canary" });
    const second = transport.request("second", { token: "not-retained" });
    output.write(`${JSON.stringify({ id: sent[1]?.["id"], result: { answer: "second" } })}\n`);
    output.write(`${JSON.stringify({ id: sent[0]?.["id"], result: { answer: "first" } })}\n`);
    await expect(first).resolves.toEqual({ answer: "first" });
    await expect(second).resolves.toEqual({ answer: "second" });
    expect(JSON.stringify(transport.history())).not.toContain("private-canary");
    expect(JSON.stringify(transport.history())).not.toContain("not-retained");
  });

  it("decodes partial, multiple, and CRLF-framed JSON messages", async () => {
    const { notifications, output, sent, transport } = harness();
    const request = transport.request("partial");
    const response = JSON.stringify({ id: sent[0]?.["id"], result: { ok: true } });
    output.write(response.slice(0, 5));
    output.write(
      `${response.slice(5)}\r\n${JSON.stringify({ method: "event/one", params: {} })}\n${JSON.stringify({ method: "event/two", params: {} })}\n`,
    );
    await expect(request).resolves.toEqual({ ok: true });
    expect(notifications).toHaveBeenCalledTimes(2);
  });

  it("bounds timeouts and cancellation while quarantining only their late responses", async () => {
    const { fatal, output, sent, transport } = harness();
    const timedOut = transport.request("slow", {}, { timeoutMilliseconds: 5 });
    await expect(timedOut).rejects.toMatchObject({ code: "APP_SERVER_REQUEST_TIMEOUT" });
    output.write(`${JSON.stringify({ id: sent[0]?.["id"], result: {} })}\n`);

    const controller = new AbortController();
    const cancelled = transport.request("cancel", {}, { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "APP_SERVER_REQUEST_CANCELLED" });
    output.write(`${JSON.stringify({ id: sent[1]?.["id"], result: {} })}\n`);
    expect(fatal).not.toHaveBeenCalled();
    expect(transport.history().filter((entry) => entry.outcome === "late")).toHaveLength(2);
  });

  it("fails closed for a duplicate completed response", async () => {
    const { fatal, output, sent, transport } = harness();
    const request = transport.request("once");
    const response = `${JSON.stringify({ id: sent[0]?.["id"], result: {} })}\n`;
    output.write(response);
    await expect(request).resolves.toEqual({});
    output.write(response);
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ code: "APP_SERVER_RESPONSE_DUPLICATE" }),
    );
  });

  it("fails closed when the writable transport applies backpressure", async () => {
    const input = new PassThrough({ highWaterMark: 1 });
    const output = new PassThrough();
    const transport = new JsonRpcTransport({ input, output });
    await expect(transport.request("bounded", { value: "x".repeat(64) })).rejects.toMatchObject({
      code: "APP_SERVER_BACKPRESSURE",
    });
  });

  it("returns pinned safe denials for server requests and projects notifications", () => {
    const { notifications, output, sent, transport } = harness();
    output.write(
      `${JSON.stringify({ id: "server-1", method: "item/tool/requestUserInput", params: { secret: "x" } })}\n`,
    );
    output.write(`${JSON.stringify({ method: "turn/progress", params: { text: "private" } })}\n`);
    expect(sent.at(-1)).toEqual({
      id: "server-1",
      result: { answers: {} },
    });
    expect(notifications).toHaveBeenCalledWith("turn/progress", { text: "private" });
    expect(JSON.stringify(transport.history())).not.toContain("private");
  });

  it.each([
    ["item/commandExecution/requestApproval", { decision: "cancel" }],
    ["item/fileChange/requestApproval", { decision: "cancel" }],
    ["mcpServer/elicitation/request", { action: "cancel" }],
    [
      "item/permissions/requestApproval",
      {
        permissions: { fileSystem: null, network: null },
        scope: "turn",
        strictAutoReview: true,
      },
    ],
  ])("answers %s without granting authority", (method, result) => {
    const { output, sent } = harness();
    output.write(`${JSON.stringify({ id: "server", method, params: {} })}\n`);
    expect(sent.at(-1)).toEqual({ id: "server", result });
  });

  it("projects a rate-limit failure without retaining its raw protocol error", async () => {
    const { output, sent, transport } = harness();
    const request = transport.request("turn/start", { learnerText: "private" });
    output.write(
      `${JSON.stringify({
        id: sent[0]?.["id"],
        error: { code: -32000, message: "UsageLimitExceeded: private provider detail" },
      })}\n`,
    );
    await expect(request).rejects.toMatchObject({ code: "APP_SERVER_RATE_LIMITED" });
    expect(JSON.stringify(transport.history())).not.toContain("provider detail");
  });

  it("fails closed for malformed, uncorrelated, oversized, and credential-bearing messages", async () => {
    for (const [line, code] of [
      ["not-json\n", "APP_SERVER_INVALID_JSON"],
      [Buffer.from([0xc3, 0x28, 0x0a]), "APP_SERVER_INVALID_JSON"],
      [`${JSON.stringify({ id: 99, result: {} })}\n`, "APP_SERVER_RESPONSE_UNCORRELATED"],
      [`${JSON.stringify({ id: 1, result: {}, error: {} })}\n`, "APP_SERVER_RESPONSE_INVALID"],
      [
        `${JSON.stringify({ method: "event", params: { accessToken: "secret" } })}\n`,
        "APP_SERVER_CREDENTIAL_MATERIAL_REJECTED",
      ],
    ] as const) {
      const { fatal, output, transport } = harness();
      output.write(line);
      expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ code }));
      await expect(transport.request("after-failure")).rejects.toMatchObject({ code });
    }
    const oversized = harness({ maximumLineBytes: 8 });
    oversized.output.write("123456789");
    expect(oversized.fatal).toHaveBeenCalledWith(
      expect.objectContaining({ code: "APP_SERVER_INBOUND_LINE_TOO_LARGE" }),
    );
  });

  it("keeps event history bounded", () => {
    const { output, transport } = harness({ maximumHistoryEntries: 3 });
    for (let index = 0; index < 8; index += 1) {
      output.write(`${JSON.stringify({ method: `event/${String(index)}`, params: {} })}\n`);
    }
    expect(transport.history()).toHaveLength(3);
    expect(transport.history().map((entry) => entry.method)).toEqual([
      "event/5",
      "event/6",
      "event/7",
    ]);
  });

  it("rejects truncated input and bounds outbound messages", async () => {
    const truncated = harness();
    truncated.output.end('{"id":1');
    await vi.waitFor(() => {
      expect(truncated.fatal).toHaveBeenCalledWith(
        expect.objectContaining({ code: "APP_SERVER_TRUNCATED_MESSAGE" }),
      );
    });

    const oversized = harness({ maximumLineBytes: 32 });
    await expect(
      oversized.transport.request("large", { value: "x".repeat(64) }),
    ).rejects.toMatchObject({ code: "APP_SERVER_OUTBOUND_LINE_TOO_LARGE" });
  });
});

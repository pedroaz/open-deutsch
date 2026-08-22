import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { AppServerProcessManager } from "../src/index.js";

const fixture = fileURLToPath(new URL("./fixtures/fake-app-server.mjs", import.meta.url));

function manager(
  scenario = "standard",
  log = vi.fn(),
  spawnObserved = vi.fn(),
): AppServerProcessManager {
  return new AppServerProcessManager({
    executable: "/deterministic/fake-codex",
    environment: {
      ...process.env,
      OPEN_DEUTSCH_FAKE_SCENARIO: scenario,
      OPENAI_API_KEY: "secret-openai",
      CODEX_API_KEY: "secret-codex",
      AWS_SECRET_ACCESS_KEY: "secret-aws",
      AZURE_CLIENT_SECRET: "secret-azure",
    },
    discover: () => Promise.resolve({ status: "available", version: "0.146.0" }),
    spawn: (_command, _arguments, options) => {
      spawnObserved();
      return spawn(process.execPath, [fixture], {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
      });
    },
    initializeTimeoutMilliseconds: 1_000,
    requestTimeoutMilliseconds: 1_000,
    shutdownGraceMilliseconds: 200,
    log,
  });
}

describe("owned App Server process manager", () => {
  it("initializes exactly once, scrubs credentials, emits redacted logs, and shuts down idempotently", async () => {
    const log = vi.fn();
    const spawnObserved = vi.fn();
    const subject = manager("standard", log, spawnObserved);
    await Promise.all([subject.start(), subject.start()]);
    expect(subject.state()).toBe("ready");
    await expect(subject.request("fake/status")).resolves.toEqual({
      initializedRequests: 1,
      initializedNotifications: 1,
      inheritedCredentialNames: [],
    });
    await Promise.all([subject.shutdown(), subject.shutdown()]);
    expect(subject.state()).toBe("stopped");
    expect(spawnObserved).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("canary-secret");
    expect(JSON.stringify(log.mock.calls)).toContain("APP_SERVER_STOPPED");
    expect(JSON.stringify(log.mock.calls)).toContain("stderrBytes");
  });

  it("does not automatically replay or restart after an owned exit", async () => {
    const spawnObserved = vi.fn();
    const subject = manager("exit-on-request", vi.fn(), spawnObserved);
    await subject.start();
    await expect(subject.request("trigger-exit")).rejects.toMatchObject({
      code: "APP_SERVER_PROCESS_EXITED",
    });
    expect(subject.state()).toBe("failed");
    expect(spawnObserved).toHaveBeenCalledTimes(1);
    await subject.shutdown();
  });

  it("restarts only after an explicit start following shutdown", async () => {
    const spawnObserved = vi.fn();
    const subject = manager("standard", vi.fn(), spawnObserved);
    await subject.start();
    await subject.shutdown();
    expect(spawnObserved).toHaveBeenCalledTimes(1);
    await subject.start();
    expect(spawnObserved).toHaveBeenCalledTimes(2);
    await expect(subject.request("fake/status")).resolves.toMatchObject({
      initializedRequests: 1,
      initializedNotifications: 1,
    });
    await subject.shutdown();
  });

  it.each(["initialize-invalid", "initialize-hang"])(
    "cleans up an owned process after %s initialization",
    async (scenario) => {
      const subject = manager(scenario);
      await expect(subject.start()).rejects.toThrow();
      expect(subject.state()).toBe("failed");
      await subject.shutdown();
      expect(subject.state()).toBe("stopped");
    },
  );

  it("starts one fresh process only after an explicit retry following exit", async () => {
    const spawnObserved = vi.fn();
    const subject = manager("exit-on-request", vi.fn(), spawnObserved);
    await subject.start();
    await expect(subject.request("trigger-exit")).rejects.toMatchObject({
      code: "APP_SERVER_PROCESS_EXITED",
    });
    await subject.start();
    expect(subject.state()).toBe("ready");
    expect(spawnObserved).toHaveBeenCalledTimes(2);
    await subject.shutdown();
  });
});

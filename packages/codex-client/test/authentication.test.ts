import { describe, expect, it, vi } from "vitest";

import { ManagedAuthenticationClient, projectAccountState } from "../src/index.js";

describe("managed authentication", () => {
  it("projects signed-out, signed-in, expired, and unsupported account states safely", () => {
    expect(projectAccountState({ account: null, requiresOpenaiAuth: true })).toEqual({
      status: "signed-out",
    });
    expect(
      projectAccountState({
        account: { type: "chatgpt", email: "private@example.invalid", planType: "plus" },
        requiresOpenaiAuth: false,
      }),
    ).toEqual({ status: "signed-in", planType: "plus" });
    expect(
      projectAccountState({
        account: { type: "chatgpt", planType: null },
        requiresOpenaiAuth: true,
      }),
    ).toEqual({ status: "expired", planType: null });
    expect(projectAccountState({ account: { type: "apiKey" }, requiresOpenaiAuth: false })).toEqual(
      { status: "unsupported", reason: "authentication-method" },
    );
    expect(
      JSON.stringify(projectAccountState({ account: null, requiresOpenaiAuth: false })),
    ).not.toMatch(/email|token|credential/iu);
  });

  it("restores with refresh disabled and maps read failures to a closed state", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ account: null, requiresOpenaiAuth: true })
      .mockRejectedValueOnce(new Error("private protocol failure"));
    const client = new ManagedAuthenticationClient({ requester: { request } });
    await expect(client.restore()).resolves.toEqual({ status: "signed-out" });
    expect(request).toHaveBeenNthCalledWith(
      1,
      "account/read",
      { refreshToken: false },
      { timeoutMilliseconds: 10_000 },
    );
    await expect(client.readAccount()).resolves.toEqual({
      status: "unavailable",
      reason: "account-read-failed",
    });
  });

  it("starts one browser login, opens only HTTPS, translates its runtime ID, and cancels it", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        type: "chatgpt",
        loginId: "runtime-login-private",
        authUrl: "https://auth.example.invalid/start",
      })
      .mockResolvedValueOnce({});
    const openExternal = vi.fn();
    const onLoginChanged = vi.fn();
    const client = new ManagedAuthenticationClient({
      requester: { request },
      openExternal,
      onLoginChanged,
    });
    const loginId = await client.startManagedLogin("browser");
    expect(loginId).toMatch(/^correlation_[0-9a-z]{32}$/u);
    expect(loginId).not.toContain("runtime-login-private");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "account/login/start",
      { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "chatgpt" },
      { timeoutMilliseconds: 10_000 },
    );
    expect(openExternal).toHaveBeenCalledWith("https://auth.example.invalid/start");
    await expect(client.startManagedLogin("device-code")).rejects.toMatchObject({
      code: "APP_SERVER_LOGIN_ALREADY_PENDING",
    });
    await client.cancelManagedLogin(loginId);
    expect(request).toHaveBeenLastCalledWith(
      "account/login/cancel",
      { loginId: "runtime-login-private" },
      { timeoutMilliseconds: 10_000 },
    );
    expect(onLoginChanged).toHaveBeenLastCalledWith(loginId, { status: "cancelled" });
  });

  it("exposes a validated device code and settles successful completion after the read race", async () => {
    const states = [
      { account: null, requiresOpenaiAuth: true },
      { account: { type: "chatgpt", planType: "pro" }, requiresOpenaiAuth: false },
    ];
    const request = vi.fn((method: string) => {
      if (method === "account/login/start") {
        return Promise.resolve({
          type: "chatgptDeviceCode",
          loginId: "runtime-device-login",
          verificationUrl: "https://auth.example.invalid/device",
          userCode: "ABCD-EFGH",
        });
      }
      return Promise.resolve(states.shift());
    });
    const onLoginChanged = vi.fn();
    const presentDeviceCode = vi.fn();
    const client = new ManagedAuthenticationClient({
      requester: { request },
      onLoginChanged,
      presentDeviceCode,
      settleAttempts: 2,
      settleDelayMilliseconds: 0,
    });
    const loginId = await client.startManagedLogin("device-code");
    expect(presentDeviceCode).toHaveBeenCalledWith({
      verificationUrl: "https://auth.example.invalid/device",
      userCode: "ABCD-EFGH",
    });
    expect(onLoginChanged).toHaveBeenCalledWith(loginId, { status: "waiting" });
    await expect(
      client.handleNotification("account/login/completed", {
        loginId: "runtime-device-login",
        success: true,
        error: null,
      }),
    ).resolves.toBe(true);
    expect(onLoginChanged).toHaveBeenLastCalledWith(loginId, { status: "complete" });
    expect(client.pendingLoginId()).toBeNull();
  });

  it("rejects insecure browser URLs, malformed device codes, and unsupported runtime methods", async () => {
    for (const response of [
      { type: "chatgpt", loginId: "login", authUrl: "http://auth.example.invalid" },
      {
        type: "chatgptDeviceCode",
        loginId: "login",
        verificationUrl: "https://auth.example.invalid",
        userCode: "secret words",
      },
      { type: "apiKey", loginId: "login" },
    ]) {
      const client = new ManagedAuthenticationClient({
        requester: {
          request: vi
            .fn()
            .mockImplementation((method: string) =>
              Promise.resolve(method === "account/login/start" ? response : {}),
            ),
        },
        openExternal: vi.fn(),
      });
      await expect(
        client.startManagedLogin(response.type === "chatgptDeviceCode" ? "device-code" : "browser"),
      ).rejects.toMatchObject({ code: "APP_SERVER_LOGIN_RESPONSE_INVALID" });
    }
  });
});

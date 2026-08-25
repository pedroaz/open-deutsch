import { describe, expect, it, vi } from "vitest";

import { projectRateLimits, RateLimitClient } from "../src/index.js";

describe("rate-limit projection", () => {
  it("prefers multi-bucket state and projects only bounded status fields", () => {
    const state = projectRateLimits({
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          limitName: "not projected",
          planType: "pro",
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
          secondary: null,
          credits: { hasCredits: true, unlimited: false, balance: "12.5" },
          individualLimit: { private: true },
          rateLimitReachedType: null,
        },
      },
      rateLimits: { limitId: "legacy", primary: { usedPercent: 100 } },
      rateLimitResetCredits: { availableCount: 2, credits: [{ id: "private" }] },
    });
    expect(state).toEqual({
      status: "available",
      buckets: [
        {
          limitId: "codex",
          planType: "pro",
          primary: {
            usedPercent: 25,
            resetsAt: 1_800_000_000,
            windowDurationMinutes: 300,
          },
          secondary: null,
        },
      ],
      resetCredits: { status: "available", availableCount: 2 },
    });
    expect(JSON.stringify(state)).not.toMatch(/limitName|individualLimit|credit.*id|private/iu);
  });

  it("classifies primary, secondary, and combined limited states", () => {
    const bucket = (primary: number, secondary: number) => ({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: primary },
        secondary: { usedPercent: secondary },
      },
    });
    expect(projectRateLimits(bucket(100, 20))).toMatchObject({
      status: "limited",
      reached: "primary",
    });
    expect(projectRateLimits(bucket(20, 100))).toMatchObject({
      status: "limited",
      reached: "secondary",
    });
    expect(projectRateLimits(bucket(100, 100))).toMatchObject({
      status: "limited",
      reached: "both",
    });
    expect(
      projectRateLimits({
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 20 },
          secondary: { usedPercent: 100 },
          rateLimitReachedType: "rate_limit_reached",
        },
      }),
    ).toMatchObject({ status: "limited", reached: "secondary" });
    expect(
      projectRateLimits({
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 20 },
          rateLimitReachedType: "workspace_member_usage_limit_reached",
        },
      }),
    ).toMatchObject({ status: "limited", reached: "unknown" });
    expect(projectRateLimits({})).toEqual({ status: "unavailable", reason: "not-reported" });
  });

  it("fails closed for malformed percentages, windows, reset credits, and duplicate IDs", () => {
    for (const value of [
      { rateLimits: "bad" },
      { rateLimits: { limitId: "codex", primary: { usedPercent: 101 } } },
      { rateLimits: { limitId: "codex", primary: { windowDurationMins: 1.5 } } },
      {
        rateLimits: { limitId: "codex" },
        rateLimitResetCredits: { availableCount: 1.5 },
      },
      {
        rateLimits: { limitId: "codex", rateLimitReachedType: "unrecognised" },
      },
      {
        rateLimitsByLimitId: {
          first: { limitId: "same" },
          second: { limitId: "same" },
        },
      },
    ]) {
      expect(() => projectRateLimits(value)).toThrow(/APP_SERVER_RATE_LIMITS_INVALID/u);
    }
  });

  it("uses the pinned read method and exposes read failures without protocol details", async () => {
    const request = vi.fn().mockRejectedValue(new Error("private response"));
    const changed = vi.fn();
    const client = new RateLimitClient({
      requester: { request },
      onRateLimitsChanged: changed,
    });
    await expect(client.refresh()).resolves.toEqual({
      status: "unavailable",
      reason: "read-failed",
    });
    expect(request).toHaveBeenCalledWith("account/rateLimits/read", undefined, {
      timeoutMilliseconds: 10_000,
    });
    expect(changed).toHaveBeenCalledWith({ status: "unavailable", reason: "read-failed" });
  });
});

import type {
  DesktopIpcEvent,
  DesktopIpcRequest,
  DesktopIpcResponse,
  OpenDeutschDesktopBridge,
} from "@open-deutsch/contracts";
import { desktopIpcEventSchema, desktopIpcResponseSchema } from "@open-deutsch/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WeeklyPlanPage } from "../src/renderer/WeeklyPlanPage.js";
import i18n from "../src/renderer/i18n.js";

const operationId = "correlation_0123456789abcdef";
const modelRequestId = "model-request_0123456789abcdef";
const planId = "plan_0123456789abcdef";

function ok(request: DesktopIpcRequest, result: unknown): DesktopIpcResponse {
  return desktopIpcResponseSchema.parse({
    status: "ok",
    channel: request.channel,
    requestId: request.requestId,
    result,
  });
}

describe("weekly plan screen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    const listeners = new Set<(event: DesktopIpcEvent) => void>();
    let generated = false;
    const invoke = vi.fn((request: DesktopIpcRequest) => {
      if (request.channel === "weekly-plan/read") {
        return ok(request, {
          rootGeneration: 1,
          plan: generated
            ? {
                planId,
                role: "advisory",
                weekStartsOn: "2026-08-17",
                requestedFrom: "desktop",
                goals: [
                  {
                    title: "Appointments",
                    outcome: "Arrange an appointment in German.",
                    suggestedActivities: [
                      {
                        kind: "writing",
                        title: "Write a booking message",
                        rationale: "Practice the appointment vocabulary.",
                        naturalRequest: "Write a short booking message.",
                        estimatedMinutes: 20,
                        context: { curriculumTopicIds: [], mistakeIds: [], vocabularyIds: [] },
                      },
                    ],
                  },
                ],
              }
            : null,
          recommendation: generated
            ? {
                primary: {
                  kind: "writing",
                  title: "Write a booking message",
                  rationale: "Practice the appointment vocabulary.",
                  naturalRequest: "Write a short booking message.",
                  estimatedMinutes: 20,
                  context: { curriculumTopicIds: [], mistakeIds: [], vocabularyIds: [] },
                },
                alternatives: [],
              }
            : null,
        });
      }
      if (request.channel === "learning-operation/start") {
        generated = true;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener(
              desktopIpcEventSchema.parse({
                event: "learning-operation-finished",
                operationId,
                submissionId: request.payload.submissionId,
                kind: "weekly-plan-generation",
                submission: "retained",
                outcome: {
                  status: "validated",
                  modelRequestId,
                  output: {
                    role: "advisory",
                    goals: [
                      {
                        title: "Appointments",
                        outcome: "Arrange an appointment in German.",
                        suggestedActivities: [
                          {
                            kind: "writing",
                            title: "Write a booking message",
                            rationale: "Practice the appointment vocabulary.",
                            naturalRequest: "Write a short booking message.",
                            estimatedMinutes: 20,
                          },
                        ],
                      },
                    ],
                    uncertainty: { level: "none" },
                    caveats: [],
                  },
                },
              }),
            );
          }
        });
        return ok(request, {
          operationId,
          submissionId: request.payload.submissionId,
          status: "accepted",
          submission: "retained",
        });
      }
      throw new Error(`Unexpected ${request.channel}`);
    });
    const bridge: OpenDeutschDesktopBridge = {
      invoke: invoke as unknown as OpenDeutschDesktopBridge["invoke"],
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      ready: vi.fn(),
    };
    window.openDeutsch = bridge;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("generates, reviews, and replaces an advisory plan without completion controls", async () => {
    const user = userEvent.setup();
    render(<WeeklyPlanPage requestAiAccess={() => Promise.resolve(true)} />);
    await user.click(await screen.findByRole("button", { name: "Generate a plan" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Appointments" })).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: "Recommended next" })).toBeTruthy();
    expect(screen.getByText(/no completion checkboxes/u)).toBeTruthy();
  });
});

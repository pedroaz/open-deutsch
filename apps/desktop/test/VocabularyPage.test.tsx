import type {
  DesktopIpcRequest,
  DesktopIpcResponse,
  OpenDeutschDesktopBridge,
} from "@open-deutsch/contracts";
import { desktopIpcResponseSchema } from "@open-deutsch/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VocabularyPage } from "../src/renderer/VocabularyPage.js";
import i18n from "../src/renderer/i18n.js";

const vocabularyId = "vocabulary_0123456789abcdefgh";
const entryBase = {
  schemaVersion: 1 as const,
  vocabularyId,
  lemma: "der Markt",
  meaning: "market",
  lexeme: {
    partOfSpeech: "noun" as const,
    nounForm: { gender: "masculine" as const, article: "der" as const },
    plural: { status: "form" as const, form: "die Märkte" },
  },
  examples: [{ german: "Ich gehe zum Markt.", meaning: "I am going to the market." }],
  source: { kind: "learner" as const, context: "Everyday shopping" },
};

function projection(state: unknown, revision = 0) {
  return {
    ...entryBase,
    state,
    revision,
    updatedAt: "2026-08-20T10:00:00.000Z",
  };
}

function ok(request: DesktopIpcRequest, result: unknown): DesktopIpcResponse {
  return desktopIpcResponseSchema.parse({
    status: "ok",
    channel: request.channel,
    requestId: request.requestId,
    result,
  });
}

describe("vocabulary screen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    let state = projection({ status: "candidate", confirmation: "required" });
    const invoke = vi.fn(async (request: DesktopIpcRequest) => {
      await Promise.resolve();
      if (request.channel === "vocabulary/read") {
        return ok(request, {
          rootGeneration: 1,
          entries: [state],
          lessonSets: [],
        });
      }
      if (request.channel === "vocabulary/confirm") {
        state = projection({
          status: "active",
          confirmedAt: "2026-08-20T10:00:00.000Z",
          dueOn: "2026-08-20",
          stage: 1,
          lastReview: null,
        });
        return ok(request, { vocabularyId, status: "updated" });
      }
      if (request.channel === "vocabulary/review") {
        state = projection(
          {
            status: "active",
            confirmedAt: "2026-08-20T10:00:00.000Z",
            dueOn: "2026-08-23",
            stage: 2,
            lastReview: { reviewedAt: "2026-08-20T10:00:00.000Z", grade: "good" },
          },
          1,
        );
        return ok(request, { vocabularyId, status: "updated" });
      }
      return ok(request, { vocabularyId, status: "updated" });
    });
    const bridge: OpenDeutschDesktopBridge = {
      invoke: invoke as OpenDeutschDesktopBridge["invoke"],
      subscribe: () => () => undefined,
      ready: vi.fn(),
    };
    window.openDeutsch = bridge;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("confirms candidates, opens the source, and reviews due cards", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<VocabularyPage onNavigate={onNavigate} />);

    await user.click(await screen.findByRole("button", { name: "Add to active review" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Good" })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Open source" }));
    expect(onNavigate).toHaveBeenCalledWith("history");
    await user.click(screen.getByRole("button", { name: "Good" }));
    await waitFor(() => {
      expect(screen.getByText(/Due 2026-08-23/u)).toBeTruthy();
    });
  });
});

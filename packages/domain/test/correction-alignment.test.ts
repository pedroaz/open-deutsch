import { describe, expect, it } from "vitest";

import {
  alignCorrectionTexts,
  correctedTextFromPresentedAlignment,
  originalTextFromPresentedAlignment,
} from "../src/index.js";

describe("correction presentation alignment", () => {
  it("derives stable replacements without trusting model offsets", () => {
    const candidates = [
      {
        kind: "replacement" as const,
        originalText: "ein Termin",
        correctedText: "einen Termin",
      },
    ];
    const first = alignCorrectionTexts(
      "Ich brauche ein Termin.",
      "Ich brauche einen Termin.",
      candidates,
    );
    const second = alignCorrectionTexts(
      "Ich brauche ein Termin.",
      "Ich brauche einen Termin.",
      candidates,
    );
    expect(second).toEqual(first);
    expect(first.filter((segment) => segment.kind !== "unchanged")).toEqual([
      {
        kind: "replacement",
        changeId: "change-1",
        originalText: "ein",
        correctedText: "einen",
        candidateIndex: 0,
      },
    ]);
  });

  it("reconstructs immutable original and corrected text across insertions and deletions", () => {
    const original = "Heute gehe ich Markt.";
    const corrected = "Heute gehe ich zum Markt";
    const alignment = alignCorrectionTexts(original, corrected);
    expect(originalTextFromPresentedAlignment(alignment)).toBe(original);
    expect(correctedTextFromPresentedAlignment(alignment)).toBe(corrected);
    expect(alignment.some((segment) => segment.kind === "insertion")).toBe(true);
    expect(alignment.some((segment) => segment.kind === "deletion")).toBe(true);
  });

  it("falls back to a bounded stable span for adversarial token counts", () => {
    const original = `Anfang ${"a ".repeat(600)}Ende`;
    const corrected = `Anfang ${"b ".repeat(600)}Ende`;
    const alignment = alignCorrectionTexts(original, corrected);
    expect(originalTextFromPresentedAlignment(alignment)).toBe(original);
    expect(correctedTextFromPresentedAlignment(alignment)).toBe(corrected);
    expect(alignment.filter((segment) => segment.kind !== "unchanged")).toHaveLength(1);
  });

  it("associates each imperfect model change with at most one derived span", () => {
    const alignment = alignCorrectionTexts("Ich brauche ein Termin.", "Ich gehe morgen zum Arzt.", [
      {
        kind: "replacement",
        originalText: "brauche ein Termin",
        correctedText: "gehe morgen zum Arzt",
      },
    ]);
    expect(
      alignment.filter(
        (segment) => segment.kind !== "unchanged" && segment.candidateIndex !== null,
      ),
    ).toHaveLength(1);
  });

  it("keeps unchanged text meaningful when no correction is needed", () => {
    expect(alignCorrectionTexts("Alles stimmt.", "Alles stimmt.")).toEqual([
      { kind: "unchanged", text: "Alles stimmt." },
    ]);
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defaultModelPreferences,
  modelPreferenceResolutionSchema,
  modelPreferencesSchema,
  modelWorkloads,
  resolveModelPreference,
  semanticEffortSemantics,
  type ModelPreferences,
  type ModelWorkload,
  type WorkloadModelPreference,
} from "../src/index.js";

type CatalogModel = Readonly<{
  id: string;
  displayName?: string;
  isDefault?: boolean;
  defaultReasoningEffort?: string | null;
  supportedReasoningEfforts?: readonly string[];
}>;

function catalog(models: readonly CatalogModel[], runtimeDefaultModelId?: string | null) {
  const projectedModels = models.map((model) => ({
    id: model.id,
    displayName: model.displayName ?? model.id,
    isDefault: model.isDefault ?? false,
    defaultReasoningEffort:
      model.defaultReasoningEffort === undefined ? "medium" : model.defaultReasoningEffort,
    supportedReasoningEfforts: [...(model.supportedReasoningEfforts ?? ["low", "medium", "high"])],
    inputModalities: ["text"] as const,
  }));
  return {
    models: projectedModels,
    runtimeDefaultModelId:
      runtimeDefaultModelId === undefined
        ? (projectedModels.find(({ isDefault }) => isDefault)?.id ?? null)
        : runtimeDefaultModelId,
    missingReasoningMetadata: projectedModels
      .filter(
        ({ defaultReasoningEffort, supportedReasoningEfforts }) =>
          defaultReasoningEffort === null || supportedReasoningEfforts.length === 0,
      )
      .map(({ id }) => id),
  };
}

function preference(
  model: WorkloadModelPreference["model"],
  effort: WorkloadModelPreference["effort"],
): WorkloadModelPreference {
  return { model, effort };
}

function resolve(
  workload: ModelWorkload,
  selectedPreference: WorkloadModelPreference,
  runtimeCatalog: ReturnType<typeof catalog>,
) {
  return resolveModelPreference(workload, selectedPreference, runtimeCatalog).resolution;
}

describe("model preferences", () => {
  it("defines the accepted Automatic semantic defaults per workload", () => {
    const preferences = modelPreferencesSchema.parse(defaultModelPreferences);
    expect(modelWorkloads).toEqual(["correction", "generation", "helper", "research"]);
    expect(preferences).toMatchObject({
      correction: { model: { mode: "automatic" }, effort: { effort: "balanced" } },
      generation: { model: { mode: "automatic" }, effort: { effort: "balanced" } },
      helper: { model: { mode: "automatic" }, effort: { effort: "fast" } },
      research: { model: { mode: "automatic" }, effort: { effort: "deep" } },
    });
    expect(semanticEffortSemantics).toEqual({
      fast: {
        preferredEffortId: "low",
        fallback: "model-default",
        automaticMaximumOrPro: "forbidden",
      },
      balanced: {
        preferredEffortId: "model-default",
        fallback: "unavailable",
        automaticMaximumOrPro: "forbidden",
      },
      deep: {
        preferredEffortId: "high",
        fallback: "closest-supported-ordinary-then-model-default",
        automaticMaximumOrPro: "forbidden",
      },
    });
    expectTypeOf(preferences).toEqualTypeOf<ModelPreferences>();
  });

  it("supports exact model and exact effort independently for each workload", () => {
    const preferences = modelPreferencesSchema.parse({
      ...defaultModelPreferences,
      correction: {
        model: { mode: "exact", modelId: "gpt-5.6" },
        effort: { mode: "exact", effortId: "xhigh" },
      },
    });
    expect(preferences.correction).toEqual({
      model: { mode: "exact", modelId: "gpt-5.6" },
      effort: { mode: "exact", effortId: "xhigh" },
    });
    expect(preferences.generation.model.mode).toBe("automatic");
  });

  it("records an effective runtime selection without pretending it is a saved override", () => {
    expect(
      modelPreferenceResolutionSchema.parse({
        schemaVersion: 1,
        workload: "generation",
        resolution: {
          status: "available",
          effectiveModelId: "gpt-runtime-default",
          effectiveEffortId: "medium",
        },
      }).resolution,
    ).toEqual({
      status: "available",
      effectiveModelId: "gpt-runtime-default",
      effectiveEffortId: "medium",
    });
  });

  it("records a visible temporary runtime-default fallback for disappeared choices", () => {
    const resolution = modelPreferenceResolutionSchema.parse({
      schemaVersion: 1,
      workload: "correction",
      resolution: {
        status: "fallback",
        effectiveModelId: "gpt-runtime-default",
        effectiveEffortId: "medium",
        fallbackBasis: "runtime-default",
        unavailableSavedChoice: "model-and-effort",
        noticeKey: "modelPreferences.fallback",
      },
    });
    expect(resolution.resolution.status).toBe("fallback");
  });

  it("distinguishes inability to fall back from a successful fallback", () => {
    expect(
      modelPreferenceResolutionSchema.safeParse({
        schemaVersion: 1,
        workload: "research",
        resolution: {
          status: "unavailable",
          unavailableRuntimeCapability: { runtimeDefaultModel: "unavailable" },
          noticeKey: "modelPreferences.unavailable",
        },
      }).success,
    ).toBe(true);
    expect(
      modelPreferenceResolutionSchema.safeParse({
        schemaVersion: 1,
        workload: "research",
        resolution: {
          status: "fallback",
          effectiveModelId: "gpt-runtime-default",
          effectiveEffortId: "medium",
          fallbackBasis: "runtime-default",
          unavailableSavedChoice: {},
          noticeKey: "modelPreferences.fallback",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps unavailable saved-choice state closed without duplicating authoritative IDs", () => {
    for (const unavailableSavedChoice of [
      {},
      "automatic-model",
      "semantic-effort",
      ["model", "model"],
      { modelId: "gpt-runtime-default" },
    ]) {
      expect(
        modelPreferenceResolutionSchema.safeParse({
          schemaVersion: 1,
          workload: "helper",
          resolution: {
            status: "fallback",
            effectiveModelId: "gpt-runtime-default",
            effectiveEffortId: "low",
            fallbackBasis: "runtime-default",
            unavailableSavedChoice,
            noticeKey: "modelPreferences.fallback",
          },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unknown workloads, invented semantic effort, and unsafe runtime IDs", () => {
    for (const candidate of [
      { ...defaultModelPreferences, voice: defaultModelPreferences.helper },
      {
        ...defaultModelPreferences,
        helper: {
          model: { mode: "automatic" },
          effort: { mode: "semantic", effort: "maximum" },
        },
      },
      {
        ...defaultModelPreferences,
        research: {
          model: { mode: "exact", modelId: "bad model id" },
          effort: { mode: "semantic", effort: "deep" },
        },
      },
    ]) {
      expect(modelPreferencesSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("resolves Automatic Fast, Balanced, and Deep against one runtime default", () => {
    const runtimeCatalog = catalog([
      {
        id: "gpt-runtime-default",
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh"],
      },
    ]);

    expect(
      resolve(
        "helper",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "fast" }),
        runtimeCatalog,
      ),
    ).toMatchObject({
      status: "available",
      effectiveModelId: "gpt-runtime-default",
      effectiveEffortId: "low",
    });
    expect(
      resolve(
        "correction",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "balanced" }),
        runtimeCatalog,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "medium" });
    expect(
      resolve(
        "research",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "deep" }),
        runtimeCatalog,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "high" });
  });

  it("preserves missing exact choices and visibly falls back to advertised defaults", () => {
    const runtimeCatalog = catalog([
      { id: "gpt-default", isDefault: true },
      { id: "gpt-saved", defaultReasoningEffort: "low" },
    ]);

    expect(
      resolve(
        "correction",
        preference(
          { mode: "exact", modelId: "gpt-disappeared" },
          { mode: "exact", effortId: "high" },
        ),
        runtimeCatalog,
      ),
    ).toEqual({
      status: "fallback",
      effectiveModelId: "gpt-default",
      effectiveEffortId: "high",
      fallbackBasis: "runtime-default",
      unavailableSavedChoice: "model",
      noticeKey: "modelPreferences.fallback",
    });
    expect(
      resolve(
        "correction",
        preference(
          { mode: "exact", modelId: "gpt-saved" },
          { mode: "exact", effortId: "unknown-saved-effort" },
        ),
        runtimeCatalog,
      ),
    ).toMatchObject({
      status: "fallback",
      effectiveModelId: "gpt-saved",
      effectiveEffortId: "low",
      unavailableSavedChoice: "effort",
    });
    expect(
      resolve(
        "correction",
        preference(
          { mode: "exact", modelId: "gpt-disappeared" },
          { mode: "exact", effortId: "unknown-saved-effort" },
        ),
        runtimeCatalog,
      ),
    ).toMatchObject({
      status: "fallback",
      effectiveModelId: "gpt-default",
      effectiveEffortId: "medium",
      unavailableSavedChoice: "model-and-effort",
    });
  });

  it("accepts explicitly advertised exceptional model and effort IDs", () => {
    const resolution = resolve(
      "research",
      preference({ mode: "exact", modelId: "gpt-5-pro" }, { mode: "exact", effortId: "xhigh" }),
      catalog([
        { id: "gpt-default", isDefault: true },
        {
          id: "gpt-5-pro",
          defaultReasoningEffort: "xhigh",
          supportedReasoningEfforts: ["high", "xhigh"],
        },
      ]),
    );
    expect(resolution).toEqual({
      status: "available",
      effectiveModelId: "gpt-5-pro",
      effectiveEffortId: "xhigh",
    });
  });

  it("never selects maximum or pro equivalents through Automatic or semantic effort", () => {
    const exceptionalDefault = catalog([
      {
        id: "gpt-5-pro",
        isDefault: true,
        defaultReasoningEffort: "medium",
      },
    ]);
    expect(
      resolve(
        "research",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "deep" }),
        exceptionalDefault,
      ),
    ).toEqual({
      status: "unavailable",
      unavailableRuntimeCapability: { runtimeDefaultModel: "unavailable" },
      noticeKey: "modelPreferences.unavailable",
    });

    const exceptionalEffortDefault = catalog([
      {
        id: "gpt-default",
        isDefault: true,
        defaultReasoningEffort: "maximum",
        supportedReasoningEfforts: ["low", "medium", "maximum", "xhigh"],
      },
    ]);
    expect(
      resolve(
        "correction",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "balanced" }),
        exceptionalEffortDefault,
      ).status,
    ).toBe("unavailable");
    expect(
      resolve(
        "research",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "deep" }),
        exceptionalEffortDefault,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "medium" });
  });

  it("uses deterministic semantic fallbacks for ordinary and unknown effort IDs", () => {
    const noHigh = catalog([
      {
        id: "gpt-default",
        isDefault: true,
        defaultReasoningEffort: "custom-runtime-effort",
        supportedReasoningEfforts: ["custom-runtime-effort", "minimal", "medium", "xhigh"],
      },
    ]);
    expect(
      resolve(
        "research",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "deep" }),
        noHigh,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "medium" });
    expect(
      resolve(
        "helper",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "fast" }),
        noHigh,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "custom-runtime-effort" });

    const unknownOnly = catalog([
      {
        id: "gpt-default",
        isDefault: true,
        defaultReasoningEffort: "custom-runtime-effort",
        supportedReasoningEfforts: ["custom-runtime-effort"],
      },
    ]);
    expect(
      resolve(
        "research",
        preference({ mode: "automatic" }, { mode: "semantic", effort: "deep" }),
        unknownOnly,
      ),
    ).toMatchObject({ status: "available", effectiveEffortId: "custom-runtime-effort" });
  });

  it("returns unavailable for missing, ambiguous, or contradictory catalog metadata", () => {
    const automaticBalanced = preference(
      { mode: "automatic" },
      { mode: "semantic", effort: "balanced" },
    );
    for (const runtimeCatalog of [
      catalog([{ id: "gpt-one" }], null),
      catalog(
        [
          { id: "gpt-one", isDefault: true },
          { id: "gpt-two", isDefault: true },
        ],
        "gpt-one",
      ),
      {
        ...catalog([{ id: "gpt-one", isDefault: true }]),
        runtimeDefaultModelId: "missing-model",
      },
      {
        ...catalog([{ id: "gpt-one", isDefault: true }]),
        missingReasoningMetadata: ["gpt-one"],
      },
    ]) {
      expect(resolve("correction", automaticBalanced, runtimeCatalog).status).toBe("unavailable");
    }

    const missingEffort = catalog([
      {
        id: "gpt-default",
        isDefault: true,
        defaultReasoningEffort: null,
        supportedReasoningEfforts: [],
      },
    ]);
    expect(resolve("correction", automaticBalanced, missingEffort)).toEqual({
      status: "unavailable",
      unavailableRuntimeCapability: { supportedEffort: "unavailable" },
      noticeKey: "modelPreferences.unavailable",
    });
  });
});

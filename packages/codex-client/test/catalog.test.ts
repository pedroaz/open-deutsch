import { describe, expect, it, vi } from "vitest";

import { ModelCatalogClient, projectModelCatalog } from "../src/index.js";

describe("runtime model catalog", () => {
  it("reads bounded visible pages and projects effort, modality, default, and upgrade metadata", async () => {
    const pages = [
      {
        data: [
          {
            id: "model-a",
            displayName: "Model A",
            hidden: false,
            isDefault: true,
            defaultReasoningEffort: "medium",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "not projected" },
              { reasoningEffort: "medium" },
            ],
            upgrade: "model-b",
            upgradeInfo: {
              model: "model-b",
              upgradeCopy: "A faster successor is available.",
              modelLink: "https://private.example.invalid",
              migrationMarkdown: "not projected",
            },
          },
        ],
        nextCursor: "page-two",
      },
      {
        data: [{ model: "model-b", displayName: "Model B", inputModalities: ["text"] }],
        nextCursor: null,
      },
    ];
    const request = vi.fn().mockImplementation(() => Promise.resolve(pages.shift()));
    const catalog = await new ModelCatalogClient({ requester: { request } }).refresh();
    expect(request).toHaveBeenNthCalledWith(
      1,
      "model/list",
      { limit: 100, includeHidden: false },
      { timeoutMilliseconds: 20_000 },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "model/list",
      { limit: 100, includeHidden: false, cursor: "page-two" },
      { timeoutMilliseconds: 20_000 },
    );
    expect(catalog).toEqual({
      models: [
        {
          id: "model-a",
          displayName: "Model A",
          isDefault: true,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium"],
          inputModalities: ["text", "image"],
          upgrade: {
            targetModelId: "model-b",
            displayName: "Model B",
            description: "A faster successor is available.",
          },
        },
        {
          id: "model-b",
          displayName: "Model B",
          isDefault: false,
          defaultReasoningEffort: null,
          supportedReasoningEfforts: [],
          inputModalities: ["text"],
          upgrade: null,
        },
      ],
      runtimeDefaultModelId: "model-a",
      missingReasoningMetadata: ["model-b"],
    });
    expect(JSON.stringify(catalog)).not.toMatch(/modelLink|migrationMarkdown|private/iu);
  });

  it("fails closed for duplicates, hidden models, ambiguous defaults, and effort conflicts", () => {
    for (const data of [
      [{ id: "duplicate" }, { id: "duplicate" }],
      [{ id: "hidden", hidden: true }],
      [
        { id: "one", isDefault: true },
        { id: "two", isDefault: true },
      ],
      [
        {
          id: "conflict",
          defaultReasoningEffort: "high",
          supportedReasoningEfforts: [{ reasoningEffort: "low" }],
        },
      ],
      [
        {
          id: "duplicate-effort",
          supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "low" }],
        },
      ],
      [{ id: "bad-modality", inputModalities: ["audio"] }],
      [{ id: "upgrade", upgrade: "next", upgradeInfo: { model: "different" } }],
    ]) {
      expect(() => projectModelCatalog({ data })).toThrow(/APP_SERVER_MODEL_CATALOG_INVALID/u);
    }
  });

  it("rejects repeated cursors and a page sequence beyond the configured bound", async () => {
    const repeated = new ModelCatalogClient({
      requester: {
        request: vi.fn().mockResolvedValue({ data: [], nextCursor: "same" }),
      },
    });
    await expect(repeated.refresh()).rejects.toMatchObject({
      code: "APP_SERVER_MODEL_CATALOG_PAGINATION_INVALID",
    });
    const bounded = new ModelCatalogClient({
      requester: {
        request: vi
          .fn()
          .mockResolvedValueOnce({ data: [], nextCursor: "one" })
          .mockResolvedValueOnce({ data: [], nextCursor: "two" }),
      },
      maximumPages: 2,
    });
    await expect(bounded.refresh()).rejects.toMatchObject({
      code: "APP_SERVER_MODEL_CATALOG_PAGINATION_LIMIT",
    });
  });

  it("refreshes after official account-change notifications only", async () => {
    const request = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
    const client = new ModelCatalogClient({ requester: { request } });
    await expect(client.handleNotification("account/updated")).resolves.toBe(true);
    await expect(client.handleNotification("model/list/updated")).resolves.toBe(false);
    await expect(client.handleNotification("turn/completed")).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

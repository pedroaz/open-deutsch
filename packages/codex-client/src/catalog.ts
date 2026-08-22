import { modelCatalogSchema, type z } from "@open-deutsch/contracts";

import {
  AppServerProjectionError,
  isJsonObject,
  optionalNonblankString,
  requiredNonblankString,
  type AppServerRequester,
} from "./projections.js";

export type ModelCatalog = z.output<typeof modelCatalogSchema>;

type ProjectedModel = ModelCatalog["models"][number];
type PendingUpgrade = Readonly<{ targetModelId: string; description: string | null }> | null;

function projectEfforts(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  const entries: unknown[] = value;
  const efforts = entries.map((entry) => {
    if (!isJsonObject(entry))
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    return requiredNonblankString(entry["reasoningEffort"], 100);
  });
  if (new Set(efforts).size !== efforts.length) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  return efforts;
}

function projectModalities(value: unknown): ("text" | "image")[] {
  if (value === undefined) return ["text", "image"];
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  const entries: unknown[] = value;
  const modalities = entries.map((entry) => {
    if (entry !== "text" && entry !== "image") {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    return entry;
  });
  if (new Set(modalities).size !== modalities.length) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  return modalities;
}

function projectUpgrade(entry: Record<string, unknown>): PendingUpgrade {
  const legacyTarget = optionalNonblankString(entry["upgrade"]);
  const info = entry["upgradeInfo"];
  if (info === undefined || info === null) {
    return legacyTarget === null ? null : { targetModelId: legacyTarget, description: null };
  }
  if (!isJsonObject(info)) throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  const targetModelId = requiredNonblankString(info["model"]);
  if (legacyTarget !== null && legacyTarget !== targetModelId) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  return {
    targetModelId,
    description: optionalNonblankString(info["upgradeCopy"], 500),
  };
}

export function projectModelCatalog(value: unknown): ModelCatalog {
  if (!isJsonObject(value) || !Array.isArray(value["data"]) || value["data"].length > 200) {
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  }
  const pending: { model: Omit<ProjectedModel, "upgrade">; upgrade: PendingUpgrade }[] = [];
  const seen = new Set<string>();
  for (const entry of value["data"]) {
    if (!isJsonObject(entry) || entry["hidden"] === true) {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    if (entry["hidden"] !== undefined && typeof entry["hidden"] !== "boolean") {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    if (entry["isDefault"] !== undefined && typeof entry["isDefault"] !== "boolean") {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    const id = optionalNonblankString(entry["id"]) ?? requiredNonblankString(entry["model"]);
    if (seen.has(id)) throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    seen.add(id);
    const supportedReasoningEfforts = projectEfforts(entry["supportedReasoningEfforts"]);
    const defaultReasoningEffort = optionalNonblankString(entry["defaultReasoningEffort"], 100);
    if (
      defaultReasoningEffort !== null &&
      supportedReasoningEfforts.length > 0 &&
      !supportedReasoningEfforts.includes(defaultReasoningEffort)
    ) {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
    }
    pending.push({
      model: {
        id,
        displayName: optionalNonblankString(entry["displayName"], 200) ?? id,
        isDefault: entry["isDefault"] === true,
        defaultReasoningEffort,
        supportedReasoningEfforts,
        inputModalities: projectModalities(entry["inputModalities"]),
      },
      upgrade: projectUpgrade(entry),
    });
  }
  const defaults = pending.filter(({ model }) => model.isDefault);
  if (defaults.length > 1) throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
  const displayNames = new Map(pending.map(({ model }) => [model.id, model.displayName]));
  return modelCatalogSchema.parse({
    models: pending.map(({ model, upgrade }) => ({
      ...model,
      upgrade:
        upgrade === null
          ? null
          : {
              ...upgrade,
              displayName: displayNames.get(upgrade.targetModelId) ?? null,
            },
    })),
    runtimeDefaultModelId: defaults[0]?.model.id ?? null,
    missingReasoningMetadata: pending
      .filter(
        ({ model }) =>
          model.defaultReasoningEffort === null || model.supportedReasoningEfforts.length === 0,
      )
      .map(({ model }) => model.id),
  });
}

export type ModelCatalogClientOptions = Readonly<{
  requester: AppServerRequester;
  maximumPages?: number;
  pageSize?: number;
  requestTimeoutMilliseconds?: number;
  onCatalogChanged?: (catalog: ModelCatalog) => void;
}>;

export class ModelCatalogClient {
  readonly #options: ModelCatalogClientOptions;

  constructor(options: ModelCatalogClientOptions) {
    this.#options = options;
  }

  async refresh(): Promise<ModelCatalog> {
    const data: unknown[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    const maximumPages = this.#options.maximumPages ?? 20;
    const pageSize = this.#options.pageSize ?? 100;
    if (
      !Number.isInteger(maximumPages) ||
      maximumPages < 1 ||
      maximumPages > 20 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_PAGINATION_INVALID");
    }
    for (let page = 0; page < maximumPages; page += 1) {
      const result = await this.#options.requester.request(
        "model/list",
        {
          limit: pageSize,
          includeHidden: false,
          ...(cursor === null ? {} : { cursor }),
        },
        { timeoutMilliseconds: this.#options.requestTimeoutMilliseconds ?? 20_000 },
      );
      if (!isJsonObject(result) || !Array.isArray(result["data"])) {
        throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
      }
      const pageData: unknown[] = result["data"];
      data.push(...pageData);
      if (data.length > 200) throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_INVALID");
      const nextCursor = optionalNonblankString(result["nextCursor"]);
      if (nextCursor === null) {
        const catalog = projectModelCatalog({ data });
        this.#options.onCatalogChanged?.(catalog);
        return catalog;
      }
      if (cursors.has(nextCursor)) {
        throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_PAGINATION_INVALID");
      }
      cursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new AppServerProjectionError("APP_SERVER_MODEL_CATALOG_PAGINATION_LIMIT");
  }

  async handleNotification(method: string): Promise<boolean> {
    if (method !== "account/updated") return false;
    await this.refresh();
    return true;
  }
}

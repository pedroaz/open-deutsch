import { dataRootGenerationSchema, type DataRootGeneration } from "@open-deutsch/contracts";

import { writeBootstrapPointer } from "./bootstrap-pointer.js";
import { materializeDataRootSelection, type DataRootSelectionPlan } from "./data-root-selection.js";
import { openDeutschMigrations } from "./migrations.js";
import { prepareDataRootDatabase, type OpenDeutschDatabase } from "./sqlite.js";

export async function switchOpenDeutschDataRoot(options: {
  currentDatabase: OpenDeutschDatabase;
  bootstrapFile: string;
  nextSelection: DataRootSelectionPlan;
  expectedGeneration: DataRootGeneration;
  selectedAt: string;
  createdAt: string;
  testMode?: boolean;
}): Promise<OpenDeutschDatabase> {
  if (options.currentDatabase.rootGeneration !== options.expectedGeneration) {
    throw new Error("OD_DATA_ROOT_SWITCH_GENERATION_CONFLICT");
  }
  const nextGeneration = dataRootGenerationSchema.parse(options.expectedGeneration + 1);
  const materializeOptions = {
    generation: nextGeneration,
    createdAt: options.createdAt,
    ...(options.testMode === undefined ? {} : { testMode: options.testMode }),
  };
  const materialized = await materializeDataRootSelection(
    options.nextSelection,
    materializeOptions,
  );

  const preparedDatabase = await prepareDataRootDatabase({
    bootstrapFile: options.bootstrapFile,
    dataRoot: materialized.dataRoot,
    rootGeneration: nextGeneration,
    migrations: openDeutschMigrations,
  });
  try {
    await writeBootstrapPointer({
      bootstrapFile: options.bootstrapFile,
      dataRoot: materialized.dataRoot,
      expectedGeneration: options.expectedGeneration,
      selectedAt: options.selectedAt,
    });
  } catch (error) {
    preparedDatabase.close();
    throw error;
  }
  options.currentDatabase.close();
  return preparedDatabase;
}

export async function initializeOpenDeutschDataRoot(options: {
  bootstrapFile: string;
  selection: DataRootSelectionPlan;
  selectedAt: string;
  createdAt: string;
  testMode?: boolean;
}): Promise<OpenDeutschDatabase> {
  const generation = dataRootGenerationSchema.parse(1);
  const materialized = await materializeDataRootSelection(options.selection, {
    generation,
    createdAt: options.createdAt,
    ...(options.testMode === undefined ? {} : { testMode: options.testMode }),
  });
  const preparedDatabase = await prepareDataRootDatabase({
    bootstrapFile: options.bootstrapFile,
    dataRoot: materialized.dataRoot,
    rootGeneration: generation,
    migrations: openDeutschMigrations,
  });
  try {
    await writeBootstrapPointer({
      bootstrapFile: options.bootstrapFile,
      dataRoot: materialized.dataRoot,
      expectedGeneration: null,
      selectedAt: options.selectedAt,
    });
  } catch (error) {
    preparedDatabase.close();
    throw error;
  }
  return preparedDatabase;
}

export async function recoverOpenDeutschDataRoot(options: {
  bootstrapFile: string;
  nextSelection: DataRootSelectionPlan;
  expectedGeneration: DataRootGeneration;
  selectedAt: string;
  createdAt: string;
  testMode?: boolean;
}): Promise<OpenDeutschDatabase> {
  const nextGeneration = dataRootGenerationSchema.parse(options.expectedGeneration + 1);
  const materialized = await materializeDataRootSelection(options.nextSelection, {
    generation: nextGeneration,
    createdAt: options.createdAt,
    ...(options.testMode === undefined ? {} : { testMode: options.testMode }),
  });
  const preparedDatabase = await prepareDataRootDatabase({
    bootstrapFile: options.bootstrapFile,
    dataRoot: materialized.dataRoot,
    rootGeneration: nextGeneration,
    migrations: openDeutschMigrations,
  });
  try {
    await writeBootstrapPointer({
      bootstrapFile: options.bootstrapFile,
      dataRoot: materialized.dataRoot,
      expectedGeneration: options.expectedGeneration,
      selectedAt: options.selectedAt,
    });
  } catch (error) {
    preparedDatabase.close();
    throw error;
  }
  return preparedDatabase;
}

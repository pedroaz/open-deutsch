export {
  dataRootDirectories,
  dataRootFormatVersion,
  dataRootManifestFilename,
  dataRootManifestSchema,
  dataRootRelativeLayout,
  operationalLogPolicy,
  resolveDataRootLayout,
  type DataRootLayout,
  type DataRootManifest,
} from "./data-root-layout.js";

export {
  assertCurrentDataRootLease,
  bootstrapPointerSchema,
  bootstrapReadStateSchema,
  readBootstrapPointer,
  writeBootstrapPointer,
  type BootstrapPointer,
  type BootstrapReadState,
} from "./bootstrap-pointer.js";

export {
  dataRootSelectionWarnings,
  inspectDataRootChoice,
  materializeDataRootSelection,
  type DataRootSelectionAction,
  type DataRootSelectionPlan,
  type DataRootSelectionWarning,
} from "./data-root-selection.js";

export {
  assertOpenDeutschDatabaseLease,
  OpenDeutschDatabase,
  openDataRootDatabase,
  resetDisposableDataRootDatabase,
  sqliteBusyTimeoutMilliseconds,
  type DatabaseMigration,
} from "./sqlite.js";

export { openDeutschMigrations, openOpenDeutschDatabase } from "./migrations.js";

export { completeAttempt, finalizeCorrection } from "./finalization.js";

export { appendOperationalLog } from "./operational-logging.js";

export {
  saveWritingAttempt,
  writingAttemptPersistenceSchema,
  type WritingAttemptPersistence,
} from "./writing-attempt.js";

export {
  OpenDeutschRepository,
  generatedActivityReadSchema,
  activeGeneratedExerciseSetSchema,
  generatedPracticeActivitySchema,
  generatedExerciseSetStartSchema,
  generatedExerciseSetCompleteSchema,
  generatedExerciseSetAbandonSchema,
  generatedExerciseAnswerSaveSchema,
  vocabularyLessonSetRecordSchema,
  learnerSettingsRecordSchema,
  learnerSettingsUpdateSchema,
  preparedActivitySchema,
  persistentHandoffCreateSchema,
  persistentHandoffSchema,
  persistentHandoffUpdateSchema,
  targetedPracticeActivitySchema,
  type HistoryFilter,
  type HistoryEntryRecord,
  type MistakePatternRecord,
  type DashboardSnapshot,
  type CorrectionMistakeSample,
  type LearnerSettingsRecord,
  type GeneratedActivityRead,
  type ActiveGeneratedExerciseSet,
  type GeneratedPracticeActivity,
  type GeneratedExerciseSetStart,
  type GeneratedExerciseSetComplete,
  type GeneratedExerciseSetAbandon,
  type GeneratedExerciseAnswerSave,
  type LearnerSettingsUpdate,
  type PreparedActivityRecord,
  type PersistentHandoffCreate,
  type PersistentHandoffRecord,
  type PersistentHandoffUpdate,
  type TargetedPracticeActivity,
  type VocabularyRecord,
  type VocabularyLessonSetRecord,
  vocabularyReviewSessionCardSchema,
  vocabularyReviewSessionSchema,
  type VocabularyReviewSessionCard,
  type VocabularyReviewSession,
} from "./repository.js";

export type { IdempotentWriteResult } from "./idempotency.js";

export {
  initializeOpenDeutschDataRoot,
  recoverOpenDeutschDataRoot,
  switchOpenDeutschDataRoot,
} from "./switching.js";

export {
  ensureResearchStagingLayout,
  readResearchStagingFile,
  removeResearchStagingFile,
  researchStagingBucketSchema,
  researchStagingBuckets,
  researchStagingManifestSchema,
  researchStagingMaximumBytes,
  resolveResearchStagingLayout,
  writeResearchStagingFile,
  writeResearchStagingManifest,
  type ResearchStagingBucket,
  type ResearchStagingLayout,
  type ResearchStagingManifest,
} from "./research-staging.js";

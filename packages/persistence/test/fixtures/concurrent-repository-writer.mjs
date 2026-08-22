import { OpenDeutschRepository, openOpenDeutschDatabase } from "../../dist/index.js";

const [bootstrapFile, dataRoot, activityId, idempotencyKey] = process.argv.slice(2);
if (!bootstrapFile || !dataRoot || !activityId || !idempotencyKey) {
  throw new Error("OD_CONCURRENT_FIXTURE_ARGUMENTS_INVALID");
}
const database = await openOpenDeutschDatabase({ bootstrapFile, dataRoot, rootGeneration: 1 });
try {
  const repository = new OpenDeutschRepository(database);
  const result = await repository.savePreparedActivity(
    {
      activityId,
      activityType: "writing",
      title: `Concurrent ${activityId}`,
      originSurface: "desktop",
      context: {
        naturalRequest: "Persist from an independent process.",
        curriculumTopicIds: [],
        mistakeIds: [],
        vocabularyIds: [],
      },
      preparedAt: "2026-08-15T12:00:00.000Z",
    },
    idempotencyKey,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  database.close();
}

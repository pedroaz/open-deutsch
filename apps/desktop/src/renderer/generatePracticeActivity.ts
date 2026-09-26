import { activityIdSchema, type DesktopIpcRequest } from "@open-deutsch/contracts";
import type { useLearningOperation } from "./useLearningOperation.js";

export type PracticeGenerationRequest = Extract<
  Extract<DesktopIpcRequest, { channel: "learning-operation/start" }>["payload"]["input"],
  { kind: "exercise-generation" }
>["request"];

export async function generatePracticeActivity(
  request: PracticeGenerationRequest,
  run: ReturnType<typeof useLearningOperation>["run"],
) {
  const result = await run({ kind: "exercise-generation", request });
  return activityIdSchema.parse(result.activityId);
}

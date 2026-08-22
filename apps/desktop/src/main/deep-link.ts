import { activityIdSchema } from "@open-deutsch/contracts";

export function parseOpenDeutschActivityUrl(value: string) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  if (
    url.protocol !== "open-deutsch:" ||
    url.hostname !== "activity" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  let activityId: string;
  try {
    activityId = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
  try {
    return { route: "activity" as const, activityId: activityIdSchema.parse(activityId) };
  } catch {
    throw new Error("OD_HANDOFF_URL_INVALID");
  }
}

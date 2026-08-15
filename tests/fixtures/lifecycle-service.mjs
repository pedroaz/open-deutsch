import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const behavior = process.argv[2];
if (behavior === "exit") process.exit(17);
if (behavior === "invalid-ready") {
  await writeFile(
    process.env.OPEN_DEUTSCH_READY_FILE,
    `${JSON.stringify({ status: "ready", runId: "stale-run" })}\n`,
    { mode: 0o600 },
  );
} else if (
  behavior !== "ready" &&
  behavior !== "stubborn" &&
  behavior !== "stubborn-timeout" &&
  behavior !== "orphan"
) {
  throw new Error(`Unknown fixture behavior: ${behavior}`);
}

if (behavior === "stubborn" || behavior === "stubborn-timeout" || behavior === "orphan") {
  const child = spawn(process.execPath, ["tests/fixtures/stubborn-child.mjs"], {
    stdio: "ignore",
  });
  await writeFile(`${process.env.OPEN_DEUTSCH_READY_FILE}.child-pid`, `${child.pid}\n`, {
    mode: 0o600,
  });
}

if (behavior === "ready" || behavior === "stubborn" || behavior === "orphan") {
  await writeFile(
    process.env.OPEN_DEUTSCH_READY_FILE,
    `${JSON.stringify({ status: "ready", runId: process.env.OPEN_DEUTSCH_RUN_ID })}\n`,
    { mode: 0o600 },
  );
  process.stdout.write("fixture service ready\n");
}
if (behavior === "orphan") setTimeout(() => process.exit(0), 50);
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1_000);

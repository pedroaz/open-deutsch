import { writeFile } from "node:fs/promises";

const [, pidFile] = process.argv.slice(2);
if (pidFile) await writeFile(pidFile, String(process.pid), "utf8");
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));

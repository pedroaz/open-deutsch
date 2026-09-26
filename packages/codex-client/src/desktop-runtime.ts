import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";

async function executableCandidate(path: string): Promise<string | undefined> {
  try {
    const canonical = await realpath(path);
    const information = await stat(canonical);
    if (!information.isFile()) return undefined;
    await access(canonical, constants.X_OK);
    return canonical;
  } catch {
    return undefined;
  }
}

export async function resolveCodexExecutable(
  configured: string | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (configured !== undefined) {
    if (!isAbsolute(configured)) return undefined;
    return executableCandidate(configured);
  }
  // Resolve the desktop installation on every launch so app updates carry their
  // bundled runtime with them. Never silently substitute the independent CLI.
  const candidates: string[] = [];
  for (const directory of (environment["PATH"] ?? "").split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    const desktop = await executableCandidate(join(directory, "chatgpt"));
    if (desktop) candidates.push(join(dirname(desktop), "resources", "codex"));
  }
  candidates.push("/usr/lib/chatgpt/resources/codex", "/opt/ChatGPT/resources/codex");
  for (const candidate of candidates) {
    const executable = await executableCandidate(candidate);
    if (executable) return executable;
  }
  return undefined;
}

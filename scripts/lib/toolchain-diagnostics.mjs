const VERSION_PATTERN = /^(?:codex-cli\s+|v)?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(raw, toolName) {
  const match = VERSION_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(`Could not parse the ${toolName} version from: ${raw.trim() || "<empty>"}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    text: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

export function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }
  return 0;
}

function isSupportedNode(version, policy) {
  const minimum = parseVersion(policy.node.minimumVersion, "configured Node.js minimum");
  const maximum = parseVersion(
    policy.node.maximumExclusiveVersion,
    "configured Node.js maximum",
  );
  return compareVersions(version, minimum) >= 0 && compareVersions(version, maximum) < 0;
}

function check(status, code, message) {
  return { status, code, message };
}

export function diagnoseToolchain(observed, policy, options = {}) {
  const requireCodex = options.requireCodex ?? false;
  const checks = [];

  try {
    const node = parseVersion(observed.nodeVersion, "Node.js");
    checks.push(
      isSupportedNode(node, policy)
        ? check("pass", "NODE_OK", `Node.js ${node.text} is supported.`)
        : check(
            "fail",
            "NODE_UNSUPPORTED",
            `Node.js ${node.text} is unsupported. Use ${policy.node.pinnedVersion} (supported: >=${policy.node.minimumVersion} <${policy.node.maximumExclusiveVersion}).`,
          ),
    );
  } catch (error) {
    checks.push(check("fail", "NODE_INVALID", error.message));
  }

  if (!observed.pnpmAvailable) {
    checks.push(
      check(
        "fail",
        "PNPM_MISSING",
        `pnpm was not found. Install the pinned pnpm ${policy.pnpm.pinnedVersion}.`,
      ),
    );
  } else {
    try {
      const pnpm = parseVersion(observed.pnpmVersion, "pnpm");
      checks.push(
        pnpm.text === policy.pnpm.pinnedVersion
          ? check("pass", "PNPM_OK", `pnpm ${pnpm.text} matches the project pin.`)
          : check(
              "fail",
              "PNPM_UNSUPPORTED",
              `pnpm ${pnpm.text} is unsupported. Install the pinned pnpm ${policy.pnpm.pinnedVersion}.`,
            ),
      );
    } catch (error) {
      checks.push(check("fail", "PNPM_INVALID", error.message));
    }
  }

  const codexFailureStatus = requireCodex ? "fail" : "warn";
  if (!observed.codexAvailable) {
    checks.push(
      check(
        codexFailureStatus,
        "CODEX_MISSING",
        `Codex CLI >=${policy.codex.minimumVersion} was not found. Local non-AI features remain available; desktop AI and Codex integration installation are disabled until Codex is installed.`,
      ),
    );
  } else {
    try {
      const codex = parseVersion(observed.codexVersion, "Codex CLI");
      const minimumCodex = parseVersion(policy.codex.minimumVersion, "configured Codex minimum");
      if (compareVersions(codex, minimumCodex) < 0) {
        checks.push(
          check(
            codexFailureStatus,
            "CODEX_UNSUPPORTED",
            `Codex CLI ${codex.text} is unsupported. Upgrade to ${policy.codex.minimumVersion} or newer; local non-AI features remain available.`,
          ),
        );
      } else if (observed.appServerStatus === "timeout") {
        checks.push(
          check(
            codexFailureStatus,
            "CODEX_APP_SERVER_TIMEOUT",
            `Codex CLI ${codex.text} did not complete the app-server capability check within 10 seconds. Run codex app-server --help and resolve the local Codex setup; local non-AI features remain available.`,
          ),
        );
      } else if (observed.appServerStatus === "failed") {
        checks.push(
          check(
            codexFailureStatus,
            "CODEX_APP_SERVER_CHECK_FAILED",
            `Codex CLI ${codex.text} failed the app-server capability check (${observed.appServerDetail || "unknown failure"}). Run codex app-server --help and resolve the local Codex setup; local non-AI features remain available.`,
          ),
        );
      } else if (observed.appServerStatus !== "available") {
        checks.push(
          check(
            codexFailureStatus,
            "CODEX_APP_SERVER_UNAVAILABLE",
            `Codex CLI ${codex.text} does not expose the required app-server command. Upgrade Codex; local non-AI features remain available.`,
          ),
        );
      } else {
        checks.push(
          check(
            "pass",
            "CODEX_OK",
            `Codex CLI ${codex.text} exposes the required app-server command.`,
          ),
        );
      }
    } catch (error) {
      checks.push(check(codexFailureStatus, "CODEX_INVALID", error.message));
    }
  }

  const ok = !checks.some((item) => item.status === "fail");
  const integrationReady =
    !checks.some(
      (item) =>
        (item.code.startsWith("NODE_") ||
          item.code.startsWith("PNPM_") ||
          item.code.startsWith("CODEX_")) &&
        item.status !== "pass",
    );

  return {
    ok,
    integrationReady,
    checks,
  };
}

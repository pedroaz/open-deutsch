# ADR-0018 — Initial Linux package format

- **Status:** accepted
- **Date:** 2026-08-21
- **Decision owners:** repository maintainers
- **Related:** IMP-148, IMP-146, [ADR-0017](ADR-0017-production-appimage-payload.md)

## Context

Open Deutsch needs one Linux package format for the initial local-first release. A second `.deb` target could improve desktop registration and helper placement on Debian-family systems, but it would also add package-manager metadata, dependency declarations, maintainer scripts, and a second release verification surface.

## Decision

Keep the Linux x86_64 AppImage as the sole initial package. The tested AppImage already carries the desktop metadata, `open-deutsch://` registration, plugin snapshot, curriculum snapshot, helper, notices, and manual replacement boundary. Require a compatible external Codex CLI and document AppImage replacement; do not add `.deb` maintainer scripts or an install-time helper mutation until a supported distribution matrix demonstrates material benefit.

## Evidence

The extracted AppImage probe verifies the stable application identity, desktop resource path, helper command, external data-root pointer, correction/restart journey, and manual replacement. The helper and plugin payload do not need privileged installation or package-manager hooks for this boundary.

## Validation commands

```text
PATH="<Node-24.18.1-bin>:$PATH" CI=true NPM_CONFIG_PRODUCTION=false npm_config_production=false PNPM_CONFIG_PRODUCTION=false pnpm run package
PATH="<Node-24.18.1-bin>:$PATH" node scripts/probe-appimage.mjs
```

## Rejected alternatives

- **Add AppImage and `.deb` together:** Rejected because the second format does not materially improve the tested local-first workflow and would double the deterministic packaging surface.
- **Use `.deb` as the only initial package:** Rejected because it limits the initial supported installation boundary to Debian-family tooling and requires additional maintainer-script/helper-placement decisions.
- **Install or bundle Codex through the package:** Rejected by the accepted external-Codex boundary.

## Accepted boundaries and consequences

- Linux x86_64 AppImage is the only initial package target.
- Debian-family installation, repository publication, signing, and automatic updates are future release decisions, not implied support.
- The package remains replaceable manually and does not modify the selected learner root.

## Supersession

None.

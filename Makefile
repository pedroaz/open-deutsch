.DEFAULT_GOAL := help

# Terminal log filters; persisted diagnostic records keep their full detail.
LEVEL ?= info
LINES ?= 50
FORMAT ?= pretty
SCOPE ?= current
COMPONENT ?=
CORRELATION ?=
export OPEN_DEUTSCH_LOG_LEVEL = $(LEVEL)
export OPEN_DEUTSCH_LOG_LINES = $(LINES)
export OPEN_DEUTSCH_LOG_FORMAT = $(FORMAT)
export OPEN_DEUTSCH_LOG_SCOPE = $(SCOPE)
export OPEN_DEUTSCH_LOG_COMPONENT = $(COMPONENT)
export OPEN_DEUTSCH_LOG_CORRELATION = $(CORRELATION)

.PHONY: help setup dev debug prd start status kill logs logs-errors logs-clear \
	typecheck lint lint-fix format format-check check \
	doctor package install-plugin \
	refresh-plugin plugin-status uninstall-plugin

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install the pinned workspace dependencies and validate the toolchain.
	@echo "+ node scripts/setup.mjs"
	@node scripts/setup.mjs

dev: ## Start the development stack in the background and wait for health.
	@echo "+ node scripts/lifecycle.mjs start dev"
	@node scripts/lifecycle.mjs start dev

debug: ## Start or attach to development and follow readable logs (LEVEL=info|debug|warn|error).
	@node scripts/lifecycle.mjs debug

prd: ## Build and start the production-like stack in the background.
	@echo "+ pnpm run prd"
	@pnpm run prd

start: prd ## Alias for make prd.

status: ## Show only tracked Open Deutsch process and health state.
	@echo "+ node scripts/lifecycle.mjs status"
	@node scripts/lifecycle.mjs status

kill: ## Stop only exact tracked Open Deutsch processes; safe when already stopped.
	@echo "+ node scripts/lifecycle.mjs kill"
	@node scripts/lifecycle.mjs kill

logs: ## Follow current-run logs (SCOPE=history includes earlier runs).
	@node scripts/lifecycle.mjs logs --follow

logs-errors: ## Follow current-run warnings and errors (SCOPE=history includes earlier runs).
	@node scripts/lifecycle.mjs logs --follow --errors

logs-clear: ## Confirm and clear all resolved Open Deutsch log files.
	@echo "+ node scripts/lifecycle.mjs logs-clear"
	@node scripts/lifecycle.mjs logs-clear

typecheck: ## Run strict TypeScript project-reference checks.
	@echo "+ pnpm run typecheck"
	@pnpm run typecheck

lint: ## Run ESLint with zero warnings.
	@echo "+ pnpm run lint"
	@pnpm run lint

lint-fix: ## Apply deterministic ESLint fixes.
	@echo "+ pnpm run lint:fix"
	@pnpm run lint:fix

format: ## Format repository-owned source and configuration files.
	@echo "+ pnpm run format"
	@pnpm run format

format-check: ## Verify Prettier formatting without changing files.
	@echo "+ pnpm run format:check"
	@pnpm run format:check

check: ## Run formatting, lint, and strict TypeScript checks without live actions.
	@echo "+ pnpm run check"
	@pnpm run check

doctor: ## Diagnose pinned tools and local workspace prerequisites without mutation.
	@echo "+ node scripts/doctor.mjs"
	@node scripts/doctor.mjs

package: ## Build the Linux release package through the configured packager.
	@echo "+ pnpm run package"
	@pnpm run package

install-plugin: ## Install only the scoped Open Deutsch Codex plugin payload.
	@echo "+ pnpm run plugin:install"
	@pnpm run plugin:install

refresh-plugin: ## Refresh only the scoped Open Deutsch Codex plugin payload.
	@echo "+ pnpm run plugin:refresh"
	@pnpm run plugin:refresh

plugin-status: ## Show supported Open Deutsch plugin and MCP status.
	@echo "+ pnpm run plugin:status"
	@pnpm run plugin:status

uninstall-plugin: ## Uninstall only the scoped Open Deutsch Codex plugin.
	@echo "+ pnpm run plugin:uninstall"
	@pnpm run plugin:uninstall

.PHONY: verify-start verify-status verify-inspect verify-do verify-shot verify-stop logs-once
verify-start: ## Build once and launch an interactive real Electron verification session.
	@node scripts/verify.mjs start
verify-status: ## Show the owned verification process status.
	@node scripts/verify.mjs status
verify-inspect: ## Inspect the current window's visible UI (session-only learner content).
	@node scripts/verify.mjs snapshot
verify-do: ## Send one bounded JSON UI action on stdin to the running session.
	@node scripts/verify.mjs do
verify-shot: ## Capture a private screenshot deleted when the session stops.
	@node scripts/verify.mjs screenshot
verify-stop: ## Clean up tracked records, restore preferences, and close the owned session.
	@node scripts/verify.mjs stop
logs-once: ## Read bounded redacted logs once with the same filters as make logs.
	@node scripts/lifecycle.mjs logs

.PHONY: build-mcp-helper
build-mcp-helper: ## Build the MCP helper with an isolated production dependency deployment.
	@node scripts/build-mcp-helper.mjs

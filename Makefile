.DEFAULT_GOAL := help

.PHONY: help setup dev prd start status kill logs logs-errors logs-clear performance \
	typecheck lint lint-fix format format-check check test-fast test test-e2e \
	test-plugin test-all doctor package verify-live verify-plugin install-plugin \
	refresh-plugin plugin-status uninstall-plugin

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install the pinned workspace dependencies and validate the toolchain.
	@echo "+ pnpm run setup"
	@pnpm run setup

dev: ## Start the development stack in the background and wait for health.
	@echo "+ pnpm run dev"
	@pnpm run dev

prd: ## Build and start the production-like stack in the background.
	@echo "+ pnpm run prd"
	@pnpm run prd

start: prd ## Alias for make prd.

status: ## Show only tracked Open Deutsch process and health state.
	@echo "+ pnpm run status"
	@pnpm run status

kill: ## Stop only exact tracked Open Deutsch processes; safe when already stopped.
	@echo "+ pnpm run kill"
	@pnpm run kill

logs: ## Follow current Open Deutsch lifecycle logs.
	@echo "+ pnpm run logs"
	@pnpm run logs

logs-errors: ## Follow warning and error records from current lifecycle logs.
	@echo "+ pnpm run logs:errors"
	@pnpm run logs:errors

logs-clear: ## Confirm and clear only resolved Open Deutsch lifecycle logs.
	@echo "+ pnpm run logs:clear"
	@pnpm run logs:clear

performance: ## Measure local performance budgets with synthetic disposable data.
	@echo "+ pnpm run performance"
	@pnpm run performance

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

check: ## Run deterministic formatting, lint, type, and fast test gates.
	@echo "+ pnpm run check"
	@pnpm run check

test-fast: ## Run the deterministic fast test gate without account usage.
	@echo "+ pnpm run test:fast"
	@pnpm run test:fast

test: test-fast ## Exact alias for make test-fast.

test-e2e: ## Run deterministic Electron journeys with fake external services.
	@echo "+ pnpm run test:e2e"
	@pnpm run test:e2e

test-plugin: ## Run deterministic plugin, skill, and MCP structural checks.
	@echo "+ pnpm run test:plugin"
	@pnpm run test:plugin

test-all: ## Run every deterministic local gate; never invokes live verification.
	@echo "+ pnpm run test:all"
	@pnpm run test:all

doctor: ## Diagnose pinned tools and local workspace prerequisites without mutation.
	@echo "+ pnpm run doctor"
	@pnpm run doctor

package: ## Build the Linux release package through the configured packager.
	@echo "+ pnpm run package"
	@pnpm run package

verify-live: ## Explicitly confirm one real-account App Server verification.
	@echo "+ pnpm run verify:live"
	@pnpm run verify:live

verify-plugin: ## Separately confirm installed-host plugin prompt verification.
	@echo "+ pnpm run verify:plugin"
	@pnpm run verify:plugin

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

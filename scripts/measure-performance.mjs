#!/usr/bin/env node

import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const performanceBudgets = Object.freeze({
  coldStartMs: 1_500,
  dashboardLoadMs: 200,
  correctionFirstEventMs: 50,
  largeHistoryQueryMs: 500,
  srsSessionCreationMs: 150,
  mcpStartupMs: 1_500,
  memoryMiB: 512,
});

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function measure(operation, count = 5) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return {
    medianMs: Math.round(percentile(samples, 0.5) * 100) / 100,
    p95Ms: Math.round(percentile(samples, 0.95) * 100) / 100,
  };
}

async function measureChildImport(relativeFile) {
  const file = pathToFileURL(path.join(repositoryRoot, relativeFile)).href;
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now();
    await execFileAsync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(file)})`],
      {
        cwd: repositoryRoot,
        env: { ...process.env, NODE_OPTIONS: "" },
      },
    );
    samples.push(performance.now() - started);
  }
  return {
    medianMs: Math.round(percentile(samples, 0.5) * 100) / 100,
    p95Ms: Math.round(percentile(samples, 0.95) * 100) / 100,
  };
}

async function measureEventLoopResponsiveness() {
  const samples = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    await new Promise((resolve) => setImmediate(resolve));
    samples.push(performance.now() - started);
  }
  return {
    medianMs: Math.round(percentile(samples, 0.5) * 100) / 100,
    p95Ms: Math.round(percentile(samples, 0.95) * 100) / 100,
  };
}

function seedDatabase(database) {
  database.exec(`
    PRAGMA journal_mode = MEMORY;
    CREATE TABLE history_entries (
      history_entry_id TEXT PRIMARY KEY,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      reconstruction_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX history_by_activity_type ON history_entries(activity_type, occurred_at DESC);
    CREATE TABLE prepared_activities (
      activity_id TEXT PRIMARY KEY,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      prepared_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX prepared_activities_dashboard ON prepared_activities(status, prepared_at DESC);
    CREATE TABLE vocabulary_entries (
      vocabulary_id TEXT PRIMARY KEY,
      lemma TEXT NOT NULL,
      status TEXT NOT NULL,
      due_on TEXT NOT NULL,
      stage INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX vocabulary_due_active ON vocabulary_entries(status, due_on, vocabulary_id);
  `);
  const history = database.prepare(
    `INSERT INTO history_entries
      (history_entry_id, entity_kind, entity_id, skill, activity_type, title, occurred_at, reconstruction_json)
     VALUES (?, 'voice-summary', ?, 'speaking', ?, ?, ?, '{}')`,
  );
  const activity = database.prepare(
    `INSERT INTO prepared_activities
      (activity_id, activity_type, title, status, prepared_at) VALUES (?, 'grammar', ?, 'prepared', ?)`,
  );
  const vocabulary = database.prepare(
    `INSERT INTO vocabulary_entries
      (vocabulary_id, lemma, status, due_on, stage) VALUES (?, ?, 'active', ?, 1)`,
  );
  database.exec("BEGIN;");
  for (let index = 0; index < 10_000; index += 1) {
    const suffix = String(index).padStart(16, "0");
    const timestamp = `2026-08-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`;
    history.run(
      `history-entry_${suffix}`,
      `voice-session_${suffix}`,
      "voice-speaking",
      "Voice summary",
      timestamp,
    );
  }
  for (let index = 0; index < 100; index += 1) {
    const suffix = String(index).padStart(16, "0");
    const timestamp = `2026-08-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`;
    activity.run(`activity_${suffix}`, "Grammar practice", timestamp);
    vocabulary.run(`vocabulary_${suffix}`, `lemma-${suffix}`, "2026-08-20");
  }
  database.exec("COMMIT;");
}

export async function runPerformanceMeasurement() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "open-deutsch-performance-"));
  const database = new DatabaseSync(path.join(temporaryRoot, "benchmark.sqlite"));
  try {
    seedDatabase(database);
    const historyQuery = database.prepare(
      `SELECT history_entry_id, title, occurred_at
       FROM history_entries
       WHERE activity_type = ? ORDER BY occurred_at DESC, history_entry_id LIMIT 100`,
    );
    const dashboardQuery = database.prepare(
      `SELECT activity_id, title, activity_type
       FROM prepared_activities WHERE status = 'prepared'
       ORDER BY prepared_at DESC, activity_id LIMIT 20`,
    );
    const srsQuery = database.prepare(
      `SELECT vocabulary_id, lemma, due_on, stage
       FROM vocabulary_entries WHERE status = 'active' AND due_on <= ?
       ORDER BY due_on, vocabulary_id LIMIT 20`,
    );
    const historyPlan = database
      .prepare(
        `EXPLAIN QUERY PLAN SELECT history_entry_id FROM history_entries
         WHERE activity_type = 'voice-speaking' ORDER BY occurred_at DESC LIMIT 100`,
      )
      .all()
      .map((row) => String(row["detail"] ?? ""));
    const dashboard = measure(() => dashboardQuery.all());
    const history = measure(() => historyQuery.all(), 10);
    const srs = measure(() => srsQuery.all());
    const correction = await measureEventLoopResponsiveness();
    const coldStart = await measureChildImport("apps/desktop/dist/main/backend.js");
    const mcpStartup = await measureChildImport("apps/mcp-server/dist/index.js");
    const memoryMiB = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
    const metrics = {
      schemaVersion: 1,
      workload: {
        historyRows: 10_000,
        preparedActivities: 100,
        dueVocabulary: 100,
      },
      budgets: performanceBudgets,
      measurements: {
        coldStart,
        dashboardLoad: dashboard,
        correctionStreamingResponsiveness: correction,
        largeHistoryQuery: history,
        srsSessionCreation: srs,
        mcpStartup,
        memoryMiB,
      },
      evidence: {
        historyPlanUsesActivityIndex: historyPlan.some((detail) =>
          /USING INDEX history_by_activity_type/iu.test(detail),
        ),
        paginationLimit: 100,
        srsLimit: 20,
      },
    };
    const failures = [
      ["coldStart", coldStart.p95Ms, performanceBudgets.coldStartMs],
      ["dashboardLoad", dashboard.p95Ms, performanceBudgets.dashboardLoadMs],
      ["correctionFirstEvent", correction.p95Ms, performanceBudgets.correctionFirstEventMs],
      ["largeHistoryQuery", history.p95Ms, performanceBudgets.largeHistoryQueryMs],
      ["srsSessionCreation", srs.p95Ms, performanceBudgets.srsSessionCreationMs],
      ["mcpStartup", mcpStartup.p95Ms, performanceBudgets.mcpStartupMs],
      ["memoryMiB", memoryMiB, performanceBudgets.memoryMiB],
    ].filter(([, value, budget]) => value > budget);
    if (failures.length > 0) {
      throw new Error(`OD_PERFORMANCE_BUDGET_EXCEEDED:${failures.map(([name]) => name).join(",")}`);
    }
    return metrics;
  } finally {
    database.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPerformanceMeasurement();
  console.log(JSON.stringify(result));
}

#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

function control() {
  const path = process.env.OPEN_DEUTSCH_FAKE_CONTROL_FILE;
  if (!path) return { scenario: "standard" };
  return JSON.parse(readFileSync(path, "utf8"));
}

const initial = control();
if (process.argv[2] === "--version") {
  process.stdout.write(`${initial.version ?? "codex-cli 0.146.0"}\n`);
  process.exit(0);
}
if (process.argv[2] === "app-server" && process.argv.includes("--help")) {
  process.stdout.write("Usage: codex app-server --stdio\n");
  process.exit(0);
}
if (process.argv[2] !== "app-server" || !process.argv.includes("--stdio")) {
  process.stderr.write("unsupported fake invocation\n");
  process.exit(2);
}

let initialized = false;
let attempt = 0;
let restoredAccount = null;
if (initial.statePath) {
  try {
    restoredAccount = JSON.parse(readFileSync(initial.statePath, "utf8")).account ?? null;
  } catch {
    restoredAccount = null;
  }
}
let account = initial.account ?? restoredAccount;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function safeOutput(task) {
  if (task === "writing-prompt") {
    return {
      title: "Einen Termin verschieben",
      format: "short-message",
      situation: "Du musst einen Arzttermin wegen der Arbeit verschieben.",
      task: "Schreibe eine kurze Nachricht, erkläre den Grund und schlage einen neuen Termin vor.",
      suggestedWordCount: 60,
      helpfulVocabulary: [
        { german: "verschieben", explanation: "move an appointment to another time" },
      ],
      uncertainty: { level: "none" },
      caveats: [],
    };
  }
  if (task === "writing-correction") {
    return {
      correctedText: "Ich gehe morgen zum Arzt.",
      summary: "The sentence was reworked for a complete destination phrase.",
      changes: [
        {
          kind: "replacement",
          originalText: "brauche ein Termin",
          correctedText: "gehe morgen zum Arzt",
          category: "word-choice",
          severity: "meaning-affecting",
          explanation: "The corrected sentence uses a complete destination phrase.",
          uncertainty: { level: "none" },
        },
      ],
      naturalAlternative: "Ich muss morgen zum Arzt gehen.",
      vocabularyCandidates: [
        {
          lemma: "der Arzt",
          meaning: "doctor",
          sourceExcerpt: "zum Arzt",
          rationale: "Useful for everyday appointments.",
          uncertainty: { level: "none" },
        },
      ],
      nextPracticeSuggestion: "Write a short message to reschedule the appointment.",
      overallUncertainty: {
        level: "some",
        explanation: "The best wording depends on the intended situation.",
      },
      caveats: ["The generated correction changes the original meaning."],
    };
  }
  if (task === "exercise-generation") {
    return {
      lesson: {
        title: "Appointments in everyday German",
        explanation:
          "Use concise appointment phrases with the correct article and time expression.",
        sections: [
          {
            heading: "Useful pattern",
            content:
              "Ich brauche einen Termin is a practical way to say that you need an appointment.",
          },
        ],
        vocabularyFoundations: [
          {
            german: "der Termin",
            explanation: "appointment",
            example: "Ich brauche einen Termin.",
          },
        ],
      },
      exercises: [
        {
          kind: "short-answer",
          title: "Appointments",
          instructions: "Answer in German.",
          explanation: null,
          cefrBand: "A2",
          objectives: ["Use appointment vocabulary."],
          hints: [],
          question: "Wann gehst du zum Arzt?",
          acceptedAnswers: ["Ich gehe morgen zum Arzt."],
        },
      ],
      uncertainty: { level: "none" },
      caveats: [],
    };
  }
  if (task === "exercise-feedback") {
    return {
      outcome: "developing",
      summary: "The answer communicates the main idea and needs one small correction.",
      strengths: ["The response answers the exercise prompt directly."],
      improvements: ["Use the dative form after the supplied preposition."],
      objectiveEvaluations: [
        {
          outcome: "developing",
          evidence: "The intended appointment vocabulary is present, with one form to improve.",
          uncertainty: { level: "none" },
        },
      ],
      suggestedAnswer: "Ich gehe morgen zum Arzt.",
      nextStep: "Write one more sentence using zum.",
      overallUncertainty: { level: "none" },
      caveats: [],
    };
  }
  if (task === "weekly-plan-generation") {
    return {
      role: "advisory",
      goals: [
        {
          title: "Appointments",
          outcome: "Arrange an appointment in German.",
          suggestedActivities: [
            {
              kind: "writing",
              title: "Write a booking message",
              rationale: "Practice in context.",
              naturalRequest: "Ask for an appointment.",
              estimatedMinutes: 15,
            },
          ],
        },
      ],
      uncertainty: { level: "none" },
      caveats: [],
    };
  }
  return {
    answer: "The preposition mit takes the dative case.",
    examples: ["Ich fahre mit dem Bus."],
    alternatives: ["Ich nehme den Bus."],
    translations: [{ sourceText: "mit dem Bus", translatedText: "by bus" }],
    miniExercises: [{ prompt: "Complete: mit ___ Bus", suggestedAnswer: "mit dem Bus" }],
    followUpSuggestions: ["Ask why mit always takes dative."],
    uncertainty: { level: "none" },
    caveats: [],
  };
}

function persistAccount(next) {
  account = next;
  const statePath = initial.statePath;
  if (statePath) writeFileSync(statePath, `${JSON.stringify({ account })}\n`, { mode: 0o600 });
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.exit(3);
  }
  if (message.method === "initialize") {
    if (initialized) return send({ id: message.id, error: { code: -32600, message: "repeat" } });
    initialized = true;
    send({ id: message.id, result: { serverInfo: { name: "fake-codex", version: "0.146.0" } } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === undefined && message.id !== undefined) return;
  if (!initialized) {
    send({ id: message.id, error: { code: -32002, message: "not initialized" } });
    return;
  }
  const scenario = control().scenario ?? initial.scenario ?? "standard";
  if (scenario === "exit" && message.id !== undefined) process.exit(23);
  if (message.method === "account/read") {
    send({
      id: message.id,
      result: {
        account: account ? { type: "chatgpt", planType: account.planType ?? null } : null,
        requiresOpenaiAuth: account === null,
      },
    });
    return;
  }
  if (message.method === "account/login/start") {
    const loginId = "login_fake_00000001";
    if (message.params?.type === "chatgptDeviceCode") {
      send({
        id: message.id,
        result: {
          type: "chatgptDeviceCode",
          loginId,
          verificationUrl: "https://example.invalid/device",
          userCode: "ABCD-EFGH",
        },
      });
    } else {
      send({
        id: message.id,
        result: { type: "chatgpt", loginId, authUrl: "https://example.invalid/authorize" },
      });
    }
    queueMicrotask(() => {
      persistAccount({ planType: "plus" });
      send({ method: "account/login/completed", params: { loginId, success: true } });
      send({ method: "account/updated", params: {} });
    });
    return;
  }
  if (message.method === "account/login/cancel") {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === "account/logout") {
    persistAccount(null);
    send({ id: message.id, result: {} });
    queueMicrotask(() => send({ method: "account/updated", params: {} }));
    return;
  }
  if (message.method === "model/list") {
    send({
      id: message.id,
      result: {
        data: [
          {
            id: "gpt-fake",
            model: "gpt-fake",
            displayName: "Fake model",
            isDefault: true,
            hidden: false,
            defaultReasoningEffort: "medium",
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Low" },
              { reasoningEffort: "medium", description: "Medium" },
              { reasoningEffort: "high", description: "High" },
            ],
            inputModalities: ["text"],
          },
        ],
        nextCursor: null,
      },
    });
    return;
  }
  if (message.method === "account/rateLimits/read") {
    send({
      id: message.id,
      result: control().rateLimitsResult ?? { rateLimits: null, rateLimitsByLimitId: {} },
    });
    return;
  }
  if (message.method === "thread/start") {
    send({ id: message.id, result: { thread: { id: `thread-${attempt}` } } });
    return;
  }
  if (message.method === "turn/start") {
    const currentAttempt = attempt;
    attempt += 1;
    const threadId = message.params?.threadId;
    const turnId = `turn-${currentAttempt}`;
    if (scenario === "rate-limit") {
      send({
        id: message.id,
        error: { code: -32000, message: "UsageLimitExceeded: private runtime detail" },
      });
      return;
    }
    send({ id: message.id, result: { turn: { id: turnId, status: "inProgress" } } });
    if (scenario === "hung-turn") return;
    queueMicrotask(() => {
      const prompt = message.params?.input?.[0]?.text ?? "";
      const injectionTriggered = typeof prompt === "string" && prompt.includes("INJECTION_TRIGGER");
      const forbiddenScenarios = {
        "forbidden-shell": {
          kind: "request",
          method: "item/commandExecution/requestApproval",
        },
        "forbidden-filesystem": { kind: "notification", method: "item/fileChange/updated" },
        "forbidden-network": {
          kind: "notification",
          method: "item/started",
          itemType: "webSearch",
        },
        "forbidden-mcp": { kind: "notification", method: "item/mcpToolCall/updated" },
        "forbidden-dynamic": { kind: "notification", method: "item/dynamicToolCall/updated" },
        "forbidden-permission": {
          kind: "request",
          method: "item/permissions/requestApproval",
        },
        "forbidden-user-input": { kind: "request", method: "item/tool/requestUserInput" },
      };
      const forbidden = forbiddenScenarios[scenario];
      if (forbidden && injectionTriggered) {
        send({
          ...(forbidden.kind === "request" ? { id: `server-${currentAttempt}` } : {}),
          method: forbidden.method,
          params: forbidden.itemType
            ? { item: { type: forbidden.itemType, syntheticCanary: "PRIVATE_LEARNER_TEXT" } }
            : { syntheticCanary: "PRIVATE_LEARNER_TEXT" },
        });
        return;
      }
      let task = "contextual-help";
      try {
        task = JSON.parse(prompt || "{}").task ?? task;
      } catch {
        task = "contextual-help";
      }
      const output =
        scenario === "invalid-output" || (scenario === "malformed-output" && currentAttempt === 0)
          ? "{"
          : JSON.stringify(safeOutput(task));
      send({
        method: "item/completed",
        params: { threadId, turnId, item: { type: "agentMessage", text: output } },
      });
      send({
        method: "turn/completed",
        params: { threadId, turn: { id: turnId, status: "completed" } },
      });
    });
    return;
  }
  if (message.method === "turn/interrupt") {
    send({ id: message.id, result: {} });
    queueMicrotask(() =>
      send({
        method: "turn/completed",
        params: {
          threadId: message.params?.threadId,
          turn: { id: message.params?.turnId, status: "interrupted" },
        },
      }),
    );
    return;
  }
  send({ id: message.id, error: { code: -32601, message: "method not found" } });
});

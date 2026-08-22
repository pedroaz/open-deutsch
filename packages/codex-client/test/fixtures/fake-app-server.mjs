import { createInterface } from "node:readline";

let initializedRequests = 0;
let initializedNotifications = 0;
const scenario = process.env.OPEN_DEUTSCH_FAKE_SCENARIO ?? "standard";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    if (scenario === "initialize-hang") return;
    initializedRequests += 1;
    send({ id: message.id, result: scenario === "initialize-invalid" ? null : { server: "fake" } });
    return;
  }
  if (message.method === "initialized") {
    initializedNotifications += 1;
    process.stderr.write("fake stderr must not be retained: canary-secret\n");
    return;
  }
  if (scenario === "exit-on-request") {
    process.exit(23);
  }
  if (message.method === "fake/status") {
    send({
      id: message.id,
      result: {
        initializedRequests,
        initializedNotifications,
        inheritedCredentialNames: [
          "OPENAI_API_KEY",
          "CODEX_API_KEY",
          "AWS_SECRET_ACCESS_KEY",
          "AZURE_CLIENT_SECRET",
        ].filter((name) => process.env[name] !== undefined),
      },
    });
    return;
  }
  send({ id: message.id, result: { ok: true } });
});

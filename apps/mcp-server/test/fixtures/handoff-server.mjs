import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod/v4";

import { createDisposableHandoffStore } from "../../../../scripts/lib/cross-surface-handoff.mjs";

const store = await createDisposableHandoffStore(process.env.OPEN_DEUTSCH_DATA_ROOT ?? "");
const server = new McpServer({ name: "open-deutsch-handoff-probe", version: "0.1.0" });
server.registerTool(
  "open_deutsch_probe_create_activity",
  {
    title: "Create disposable prepared activity",
    description: "Create one prepared activity in the disposable handoff store.",
    inputSchema: z.object({ id: z.string(), title: z.string() }),
    outputSchema: z.object({ id: z.string(), title: z.string(), source: z.string() }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (activity) => {
    const created = await store.createFromMcp(activity);
    return {
      content: [{ type: "text", text: `Prepared activity ${created.id} created.` }],
      structuredContent: created,
    };
  },
);
serveStdio(() => server, {
  onerror: () => process.stderr.write("OD_HANDOFF_MCP_PROTOCOL_ERROR\n"),
});

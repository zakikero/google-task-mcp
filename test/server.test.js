import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../server/index.js", import.meta.url));

test("the STDIO server starts and advertises all tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      GOOGLE_TASKS_CLIENT_ID: "test-client-id",
      GOOGLE_TASKS_CLIENT_SECRET: "test-client-secret",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "google-task-mcp-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map(({ name }) => name),
      [
        "google_tasks_get_authorization_url",
        "google_tasks_complete_authorization",
        "google_tasks_list_tasklists",
        "google_tasks_list_tasks",
        "google_tasks_create_task",
        "google_tasks_update_task",
        "google_tasks_set_task_completion",
        "google_tasks_delete_task",
      ],
    );
  } finally {
    await client.close();
  }
});

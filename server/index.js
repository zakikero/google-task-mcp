import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { google } from "googleapis";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const REDIRECT_URI = process.env.GOOGLE_TASKS_REDIRECT_URI || "http://127.0.0.1:53682/oauth2callback";
const TOKEN_PATH = process.env.GOOGLE_TASKS_TOKEN_PATH || join(process.env.APPDATA || homedir(), "google-task-mcp", "token.json");
let pendingAuthorization = null;

function text(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function requireCredentials() {
  const { GOOGLE_TASKS_CLIENT_ID: clientId, GOOGLE_TASKS_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_TASKS_CLIENT_ID or GOOGLE_TASKS_CLIENT_SECRET. Configure them before authorizing.");
  }
  return { clientId, clientSecret };
}

function oauthClient() {
  const { clientId, clientSecret } = requireCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

async function saveTokens(tokens) {
  await mkdir(dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function authenticatedTasks() {
  const client = oauthClient();
  try {
    client.setCredentials(JSON.parse(await readFile(TOKEN_PATH, "utf8")));
  } catch {
    throw new Error("Google Tasks is not authorized. Call google_tasks_get_authorization_url, finish consent, then call google_tasks_complete_authorization.");
  }
  client.on("tokens", async (tokens) => {
    const current = client.credentials;
    await saveTokens({ ...current, ...tokens });
  });
  return google.tasks({ version: "v1", auth: client });
}

function callbackPage(message, ok) {
  return `<!doctype html><title>Google Tasks authorization</title><h1>${ok ? "Authorization complete" : "Authorization failed"}</h1><p>${message}</p><p>You can return to Codex.</p>`;
}

async function beginAuthorization() {
  if (pendingAuthorization) throw new Error("Authorization is already in progress. Finish it or restart the MCP server.");
  const client = oauthClient();
  const callback = new URL(REDIRECT_URI);
  if (callback.hostname !== "127.0.0.1" && callback.hostname !== "localhost") throw new Error("GOOGLE_TASKS_REDIRECT_URI must use localhost or 127.0.0.1 for this local plugin.");
  const state = crypto.randomUUID();
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, REDIRECT_URI);
    if (requestUrl.pathname !== callback.pathname) { response.writeHead(404).end(); return; }
    if (requestUrl.searchParams.get("state") !== state || !requestUrl.searchParams.get("code")) {
      response.writeHead(400, { "content-type": "text/html" }).end(callbackPage("The authorization response was invalid. Please try again.", false));
      resolveResult({ error: "Invalid OAuth callback state or missing authorization code." });
      return;
    }
    try {
      const { tokens } = await client.getToken(requestUrl.searchParams.get("code"));
      await saveTokens(tokens);
      response.writeHead(200, { "content-type": "text/html" }).end(callbackPage("Your local token was saved successfully.", true));
      resolveResult({ ok: true });
    } catch (error) {
      response.writeHead(500, { "content-type": "text/html" }).end(callbackPage("Token exchange failed. Check your OAuth client settings.", false));
      resolveResult({ error: error.message });
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(Number(callback.port || 80), callback.hostname, resolve); });
  pendingAuthorization = { server, result, expiresAt: Date.now() + 10 * 60_000 };
  setTimeout(() => {
    if (pendingAuthorization?.server === server) { server.close(); pendingAuthorization = null; }
  }, 10 * 60_000).unref();
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [TASKS_SCOPE], state });
}

async function finishAuthorization() {
  if (!pendingAuthorization) throw new Error("No authorization is in progress. Call google_tasks_get_authorization_url first.");
  if (Date.now() > pendingAuthorization.expiresAt) throw new Error("Authorization timed out. Start it again.");
  const { server, result } = pendingAuthorization;
  const outcome = await result;
  server.close();
  pendingAuthorization = null;
  if (outcome.error) throw new Error(outcome.error);
  return text("Google Tasks authorization completed. You can now use task tools.");
}

const server = new McpServer({ name: "google-task-mcp", version: "0.1.0" });
server.tool("google_tasks_get_authorization_url", "Start local OAuth 2.0 authorization and return the URL the user must open in a browser.", {}, async () => text({ authorizationUrl: await beginAuthorization(), expiresInSeconds: 600 }));
server.tool("google_tasks_complete_authorization", "Confirm the browser OAuth callback has completed and save the local token.", {}, finishAuthorization);
server.tool("google_tasks_list_tasklists", "List the user's Google Tasks lists.", {}, async () => {
  const response = await (await authenticatedTasks()).tasklists.list({ maxResults: 100 });
  return text(response.data.items || []);
});
server.tool("google_tasks_list_tasks", "List tasks in a Google Task list.", { tasklistId: z.string().default("@default"), showCompleted: z.boolean().default(false), showHidden: z.boolean().default(false), maxResults: z.number().int().min(1).max(100).default(100) }, async (input) => {
  const response = await (await authenticatedTasks()).tasks.list({ tasklist: input.tasklistId, showCompleted: input.showCompleted, showHidden: input.showHidden, maxResults: input.maxResults });
  return text(response.data.items || []);
});
server.tool("google_tasks_create_task", "Create a Google Task. Due dates are RFC 3339 timestamps, for example 2026-08-18T17:00:00Z.", { title: z.string().min(1).max(1024), tasklistId: z.string().default("@default"), notes: z.string().max(8192).optional(), due: z.string().datetime().optional(), parent: z.string().optional(), previous: z.string().optional() }, async ({ tasklistId, ...task }) => text((await (await authenticatedTasks()).tasks.insert({ tasklist: tasklistId, requestBody: task })).data));
server.tool("google_tasks_update_task", "Update a task's title, notes, or due date. At least one editable field is required.", { tasklistId: z.string().default("@default"), taskId: z.string().min(1), title: z.string().min(1).max(1024).optional(), notes: z.string().max(8192).optional(), due: z.string().datetime().nullable().optional() }, async ({ tasklistId, taskId, ...changes }) => {
  if (Object.keys(changes).length === 0) throw new Error("Provide at least one of title, notes, or due.");
  return text((await (await authenticatedTasks()).tasks.patch({ tasklist: tasklistId, task: taskId, requestBody: changes })).data);
});
server.tool("google_tasks_set_task_completion", "Complete or uncomplete a task.", { tasklistId: z.string().default("@default"), taskId: z.string().min(1), completed: z.boolean() }, async ({ tasklistId, taskId, completed }) => text((await (await authenticatedTasks()).tasks.patch({ tasklist: tasklistId, task: taskId, requestBody: { status: completed ? "completed" : "needsAction" } })).data));
server.tool("google_tasks_delete_task", "Permanently delete one task. First show the exact task to the user; this tool refuses to run without confirm: true.", { tasklistId: z.string().default("@default"), taskId: z.string().min(1), confirm: z.literal(true).describe("Must be true after the user explicitly confirms deletion.") }, async ({ tasklistId, taskId }) => {
  await (await authenticatedTasks()).tasks.delete({ tasklist: tasklistId, task: taskId });
  return text({ deleted: true, taskId, tasklistId });
});

await server.connect(new StdioServerTransport());

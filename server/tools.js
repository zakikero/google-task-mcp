import { z } from "zod";
import { textResult } from "./mcp-result.js";

const taskListId = z.string().default("@default");
const taskId = z.string().min(1);

export function registerGoogleTaskTools(server, authorization) {
  server.tool(
    "google_tasks_get_authorization_url",
    "Start local OAuth 2.0 authorization and return the URL to open in a browser.",
    {},
    async () =>
      textResult({
        authorizationUrl: await authorization.beginAuthorization(),
        expiresInSeconds: 600,
      }),
  );

  server.tool(
    "google_tasks_complete_authorization",
    "Confirm that browser authorization completed and the local token was saved.",
    {},
    async () => {
      await authorization.finishAuthorization();
      return textResult("Google Tasks authorization completed. You can now use task tools.");
    },
  );

  server.tool(
    "google_tasks_list_tasklists",
    "List the user's Google Tasks lists.",
    {},
    async () => {
      const tasks = await authorization.getTasksClient();
      const response = await tasks.tasklists.list({ maxResults: 100 });
      return textResult(response.data.items || []);
    },
  );

  server.tool(
    "google_tasks_list_tasks",
    "List tasks in a Google Tasks list.",
    {
      tasklistId: taskListId,
      showCompleted: z.boolean().default(false),
      showHidden: z.boolean().default(false),
      maxResults: z.number().int().min(1).max(100).default(100),
    },
    async ({ tasklistId, showCompleted, showHidden, maxResults }) => {
      const tasks = await authorization.getTasksClient();
      const response = await tasks.tasks.list({
        tasklist: tasklistId,
        showCompleted,
        showHidden,
        maxResults,
      });
      return textResult(response.data.items || []);
    },
  );

  server.tool(
    "google_tasks_create_task",
    "Create a Google Task. Due dates use RFC 3339, for example 2026-08-18T17:00:00Z.",
    {
      title: z.string().min(1).max(1024),
      tasklistId: taskListId,
      notes: z.string().max(8192).optional(),
      due: z.string().datetime().optional(),
      parent: z.string().optional(),
      previous: z.string().optional(),
    },
    async ({ tasklistId, parent, previous, ...task }) => {
      const tasks = await authorization.getTasksClient();
      const response = await tasks.tasks.insert({
        tasklist: tasklistId,
        parent,
        previous,
        requestBody: task,
      });
      return textResult(response.data);
    },
  );

  server.tool(
    "google_tasks_update_task",
    "Update a task's title, notes, or due date. At least one editable field is required.",
    {
      tasklistId: taskListId,
      taskId,
      title: z.string().min(1).max(1024).optional(),
      notes: z.string().max(8192).optional(),
      due: z.string().datetime().nullable().optional(),
    },
    async ({ tasklistId, taskId, ...changes }) => {
      if (Object.keys(changes).length === 0) {
        throw new Error("Provide at least one of title, notes, or due.");
      }

      const tasks = await authorization.getTasksClient();
      const response = await tasks.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: changes,
      });
      return textResult(response.data);
    },
  );

  server.tool(
    "google_tasks_set_task_completion",
    "Complete or uncomplete a task.",
    { tasklistId: taskListId, taskId, completed: z.boolean() },
    async ({ tasklistId, taskId, completed }) => {
      const tasks = await authorization.getTasksClient();
      const response = await tasks.tasks.patch({
        tasklist: tasklistId,
        task: taskId,
        requestBody: { status: completed ? "completed" : "needsAction" },
      });
      return textResult(response.data);
    },
  );

  server.tool(
    "google_tasks_delete_task",
    "Permanently delete one task. Show the exact task first; this tool requires confirm: true.",
    {
      tasklistId: taskListId,
      taskId,
      confirm: z.literal(true).describe("Must be true after the user explicitly confirms deletion."),
    },
    async ({ tasklistId, taskId }) => {
      const tasks = await authorization.getTasksClient();
      await tasks.tasks.delete({ tasklist: tasklistId, task: taskId });
      return textResult({ deleted: true, taskId, tasklistId });
    },
  );
}

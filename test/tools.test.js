import assert from "node:assert/strict";
import test from "node:test";
import { registerGoogleTaskTools } from "../server/tools.js";

const expectedToolNames = [
  "google_tasks_get_authorization_url",
  "google_tasks_complete_authorization",
  "google_tasks_list_tasklists",
  "google_tasks_list_tasks",
  "google_tasks_create_task",
  "google_tasks_update_task",
  "google_tasks_set_task_completion",
  "google_tasks_delete_task",
];

function registerTools(authorization = {}) {
  const tools = new Map();
  const server = {
    tool(name, description, schema, handler) {
      tools.set(name, { description, schema, handler });
    },
  };

  registerGoogleTaskTools(server, authorization);
  return tools;
}

test("registerGoogleTaskTools keeps the public MCP tool interface", () => {
  assert.deepEqual([...registerTools().keys()], expectedToolNames);
});

test("create task sends positioning fields as API parameters", async () => {
  let insertRequest;
  const authorization = {
    async getTasksClient() {
      return {
        tasks: {
          async insert(request) {
            insertRequest = request;
            return { data: { id: "new-task" } };
          },
        },
      };
    },
  };
  const tools = registerTools(authorization);

  await tools.get("google_tasks_create_task").handler({
    tasklistId: "list-1",
    title: "Child task",
    notes: "Details",
    parent: "parent-1",
    previous: "task-1",
  });

  assert.deepEqual(insertRequest, {
    tasklist: "list-1",
    parent: "parent-1",
    previous: "task-1",
    requestBody: { title: "Child task", notes: "Details" },
  });
});

test("update task rejects an empty change", async () => {
  const tools = registerTools({
    async getTasksClient() {
      throw new Error("The API client should not be created for an invalid request.");
    },
  });

  await assert.rejects(
    tools.get("google_tasks_update_task").handler({ tasklistId: "@default", taskId: "task-1" }),
    /Provide at least one of title, notes, or due/,
  );
});

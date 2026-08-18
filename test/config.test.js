import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_REDIRECT_URI, loadConfig } from "../server/config.js";

const credentials = {
  GOOGLE_TASKS_CLIENT_ID: "client-id",
  GOOGLE_TASKS_CLIENT_SECRET: "client-secret",
};

test("loadConfig applies local defaults", () => {
  const config = loadConfig({ ...credentials, APPDATA: "C:\\Users\\example\\AppData\\Roaming" });

  assert.equal(config.redirectUri, DEFAULT_REDIRECT_URI);
  assert.equal(
    config.tokenPath,
    join("C:\\Users\\example\\AppData\\Roaming", "google-task-mcp", "token.json"),
  );
});

test("loadConfig accepts explicit local redirect and token paths", () => {
  const config = loadConfig({
    ...credentials,
    GOOGLE_TASKS_REDIRECT_URI: "http://localhost:8080/callback",
    GOOGLE_TASKS_TOKEN_PATH: "C:\\tokens\\google.json",
  });

  assert.equal(config.redirectUrl.port, "8080");
  assert.equal(config.tokenPath, "C:\\tokens\\google.json");
});

test("loadConfig uses XDG_CONFIG_HOME outside Windows", () => {
  const config = loadConfig({ ...credentials, XDG_CONFIG_HOME: "/home/example/.config" });

  assert.equal(config.tokenPath, join("/home/example/.config", "google-task-mcp", "token.json"));
});

test("loadConfig requires both OAuth credentials", () => {
  assert.throws(() => loadConfig({}), /Missing Google OAuth credentials/);
});

test("loadConfig rejects non-local redirect hosts", () => {
  assert.throws(
    () =>
      loadConfig({
        ...credentials,
        GOOGLE_TASKS_REDIRECT_URI: "https://example.com/oauth2callback",
      }),
    /must use localhost or 127\.0\.0\.1/,
  );
});

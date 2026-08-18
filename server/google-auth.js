import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { google } from "googleapis";
import { GOOGLE_TASKS_SCOPE } from "./config.js";

const AUTHORIZATION_TIMEOUT_MS = 10 * 60_000;

function callbackPage(message, succeeded) {
  const heading = succeeded ? "Authorization complete" : "Authorization failed";
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Google Tasks authorization</title></head>
  <body><h1>${heading}</h1><p>${message}</p><p>You can return to Codex.</p></body>
</html>`;
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

export function createGoogleAuthorization(config) {
  let pendingAuthorization = null;

  function createOAuthClient() {
    return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  }

  async function saveTokens(tokens) {
    await mkdir(dirname(config.tokenPath), { recursive: true });
    await writeFile(config.tokenPath, JSON.stringify(tokens, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async function getTasksClient() {
    const oauthClient = createOAuthClient();

    try {
      const savedTokens = JSON.parse(await readFile(config.tokenPath, "utf8"));
      oauthClient.setCredentials(savedTokens);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`The saved token file is invalid JSON: ${config.tokenPath}`);
      }

      throw new Error(
        "Google Tasks is not authorized. Run google_tasks_get_authorization_url, " +
          "complete consent in the browser, then run google_tasks_complete_authorization.",
      );
    }

    oauthClient.on("tokens", (newTokens) => {
      saveTokens({ ...oauthClient.credentials, ...newTokens }).catch((error) => {
        console.error("Could not save refreshed Google OAuth tokens:", error);
      });
    });

    return google.tasks({ version: "v1", auth: oauthClient });
  }

  async function beginAuthorization() {
    if (pendingAuthorization) {
      throw new Error("Authorization is already in progress. Finish it or restart the MCP server.");
    }

    const oauthClient = createOAuthClient();
    const state = randomUUID();
    let resolveResult;
    const result = new Promise((resolve) => {
      resolveResult = resolve;
    });

    const callbackServer = createServer(async (request, response) => {
      const requestUrl = new URL(request.url, config.redirectUri);

      if (requestUrl.pathname !== config.redirectUrl.pathname) {
        response.writeHead(404).end();
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (requestUrl.searchParams.get("state") !== state || !code) {
        sendHtml(
          response,
          400,
          callbackPage("The authorization response was invalid. Please try again.", false),
        );
        resolveResult({ error: "Invalid OAuth callback state or missing authorization code." });
        return;
      }

      try {
        const { tokens } = await oauthClient.getToken(code);
        await saveTokens(tokens);
        sendHtml(response, 200, callbackPage("Your local token was saved successfully.", true));
        resolveResult({ ok: true });
      } catch (error) {
        sendHtml(
          response,
          500,
          callbackPage("Token exchange failed. Check your OAuth client settings.", false),
        );
        resolveResult({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    await new Promise((resolve, reject) => {
      callbackServer.once("error", reject);
      callbackServer.listen(
        Number(config.redirectUrl.port || 80),
        config.redirectUrl.hostname,
        resolve,
      );
    });

    const expiresAt = Date.now() + AUTHORIZATION_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      if (pendingAuthorization?.server !== callbackServer) return;
      resolveResult({ error: "Authorization timed out. Start it again." });
      callbackServer.close();
      pendingAuthorization = null;
    }, AUTHORIZATION_TIMEOUT_MS);
    timeout.unref();

    pendingAuthorization = { server: callbackServer, result, expiresAt, timeout };

    return oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [GOOGLE_TASKS_SCOPE],
      state,
    });
  }

  async function finishAuthorization() {
    if (!pendingAuthorization) {
      throw new Error("No authorization is in progress. Run google_tasks_get_authorization_url first.");
    }

    const authorization = pendingAuthorization;
    const outcome = await authorization.result;

    clearTimeout(authorization.timeout);
    authorization.server.close();
    if (pendingAuthorization === authorization) pendingAuthorization = null;

    if (outcome.error) throw new Error(outcome.error);
  }

  return { beginAuthorization, finishAuthorization, getTasksClient };
}

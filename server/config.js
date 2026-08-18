import { homedir } from "node:os";
import { join } from "node:path";

export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";

export function loadConfig(environment = process.env) {
  const clientId = environment.GOOGLE_TASKS_CLIENT_ID;
  const clientSecret = environment.GOOGLE_TASKS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Google OAuth credentials. Set GOOGLE_TASKS_CLIENT_ID and " +
        "GOOGLE_TASKS_CLIENT_SECRET in your environment or .env file.",
    );
  }

  const redirectUri = environment.GOOGLE_TASKS_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const redirectUrl = new URL(redirectUri);

  if (!["127.0.0.1", "localhost"].includes(redirectUrl.hostname)) {
    throw new Error(
      "GOOGLE_TASKS_REDIRECT_URI must use localhost or 127.0.0.1 because authorization runs locally.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    redirectUrl,
    tokenPath:
      environment.GOOGLE_TASKS_TOKEN_PATH ||
      join(
        environment.APPDATA || environment.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "google-task-mcp",
        "token.json",
      ),
  };
}

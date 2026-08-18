# Google Task MCP

A local MCP server and Codex plugin for listing, creating, updating, completing, uncompleting, and deleting Google Tasks. It uses OAuth 2.0 and requests only the Google Tasks scope:

`https://www.googleapis.com/auth/tasks`

## Requirements

- Node.js 20 or newer
- A Google Cloud project
- Codex or another MCP client that supports local STDIO servers

## Google Cloud setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Enable **Google Tasks API** under **APIs & Services → Library**.
3. Configure the OAuth consent screen. Add yourself as a test user while the app is in testing.
4. Create an **OAuth client ID** of type **Desktop app**. Add `http://127.0.0.1:53682/oauth2callback` as an authorized redirect URI if the client configuration permits redirect-URI management.
## Install dependencies

```powershell
npm install
npm run check
```

## Configure credentials

Set the following variables in the environment that launches Codex. `.env.example` documents the required values; the server intentionally does not load `.env` automatically.

```text
GOOGLE_TASKS_CLIENT_ID
GOOGLE_TASKS_CLIENT_SECRET
GOOGLE_TASKS_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback
```

Optionally set `GOOGLE_TASKS_TOKEN_PATH` to choose where the local OAuth token is stored.

## Use as a Codex plugin

The repository already includes `.codex-plugin/plugin.json` and `.mcp.json`. Install it through a local Codex plugin marketplace, then restart Codex so the bundled STDIO server and tool definitions are loaded.

For development without packaging, configure the server directly in Codex using:

```text
command: node
args: <absolute-repository-path>/server/index.js
```

After Codex connects, call `google_tasks_get_authorization_url`, open the returned URL, approve access, and call `google_tasks_complete_authorization`.

The refresh token is stored locally at `%APPDATA%\\google-task-mcp\\token.json` by default. Set `GOOGLE_TASKS_TOKEN_PATH` to choose a different local path. Remove that file to disconnect the account.

## Tools and safety

The server provides tools to list task lists and tasks, create and update tasks, complete or uncomplete a task, and delete a task. Deletion is refused unless `confirm` is set to `true`; callers should first show the exact task being deleted. Other changes are immediately applied to Google Tasks.

OAuth authorization requires the loopback callback listener to remain running. The browser callback displays a simple success or error page and never exposes tokens in the URL or tool output.

## Local testing

Run `npm run check` for a syntax check. OAuth/API calls require configured credentials and an interactive browser authorization.

## Privacy

OAuth credentials and task data remain on the local machine except for requests sent directly to Google's APIs. Never commit `.env` or the generated token file. Both are excluded by `.gitignore`.

## License

Released under the [MIT License](LICENSE).

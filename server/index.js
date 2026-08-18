import { fileURLToPath } from "node:url";
import { config as loadEnvironmentFile } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createGoogleAuthorization } from "./google-auth.js";
import { registerGoogleTaskTools } from "./tools.js";

loadEnvironmentFile({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const server = new McpServer({ name: "google-task-mcp", version: "0.1.0" });
const authorization = createGoogleAuthorization(loadConfig());

registerGoogleTaskTools(server, authorization);
await server.connect(new StdioServerTransport());

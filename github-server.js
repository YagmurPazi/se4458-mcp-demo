// GitHub MCP server. Keeps issues in memory instead of calling the real GitHub API.

import { McpServer, requireScopes } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { GITHUB_URL } from "./config.js";
import { serveMcp } from "./serve-mcp.js";

//example issues in memory, no database
const issues = [
  { id: 40, title: "Login page is slow" },
  { id: 41, title: "Typo in README" },
];
let nextId = 42; // the first new issue gets #42

// Defines the server's tools. Called for every request (stateless).
function buildServer() {
  const server = new McpServer({ name: "github", version: "1.0.0" });

  // Tool 1: lists the issues. Needs issues:read.
  server.registerTool(
    "list_issues",
    {
      description: "List the open issues of the repository",
      scopeChallenge: requireScopes("issues:read"),
    },
    async () => ({
      content: [
        {
          type: "text",
        },
      ],
    }),
  );

  // Tool 2: opens a new issue with the given title. Needs issues:write.
  server.registerTool(
    "create_issue",
    {
      description: "Open a new issue in the repository",
      inputSchema: z.object({ title: z.string() }), // parameter: title (text)
      scopeChallenge: requireScopes("issues:write"), // missing scope -> 403 insufficient_scope
    },
    async ({ title }) => {
      const issue = { id: nextId++, title };
      issues.push(issue);
      return {
        content: [{ type: "text", text: `Issue #${issue.id} created` }],
      };
    },
  );

  return server;
}

// Start the server on port 4001 with its name, scopes and tools.
serveMcp({
  name: "GitHub MCP server",
  url: GITHUB_URL,
  scopes: ["issues:read", "issues:write"],
  buildServer,
});

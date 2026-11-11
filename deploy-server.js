// Deploy MCP server. Pretends to deploy; the point is who is allowed to.

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { DEPLOY_URL } from "./config.js";
import { serveMcp } from "./serve-mcp.js";

// deploy to staging needs deploy:staging, deploy to prod needs deploy:prod
// scenario 4: prod without deploy:prod -> 403
function needsDeployScope({ request, authInfo }) {
  const scope = `deploy:${request.params?.arguments?.environment}`;
  if (!authInfo || authInfo.scopes.includes(scope)) return undefined; // scope is in the token -> tool runs
  return { scopes: [scope], errorDescription: `${scope} is required` }; // scope is not in the token -> 403
}

// tools of this server, created again for every request (stateless)
function buildServer() {
  const server = new McpServer({ name: "deploy", version: "1.0.0" });

  // one tool, the needed scope changes with the environment
  server.registerTool(
    "deploy",
    {
      description: "Deploy the latest build to an environment",
      inputSchema: z.object({ environment: z.enum(["staging", "prod"]) }), // only staging or prod
      scopeChallenge: needsDeployScope, // missing scope -> 403 insufficient_scope
    },
    async ({ environment }) => ({
      content: [{ type: "text", text: `Deployed to ${environment}` }],
    }),
  );

  return server;
}

// start deploy server on port 4002
serveMcp({
  name: "Deploy MCP server",
  url: DEPLOY_URL,
  scopes: ["deploy:staging", "deploy:prod"],
  buildServer,
});

// Starts one protected MCP server over Streamable HTTP. Shared by the GitHub and Deploy servers.

import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { tokenChecker } from "./check-token.js";
import { AUTH_METADATA } from "./config.js";

// Shared code that starts an MCP server (used by both GitHub and Deploy servers).
export function serveMcp({ name, url, scopes, buildServer }) {
  // create express web server made for mcp-> this func comes from SDK
  const app = createMcpExpressApp();

  // Tells clients where to get a token for this server.
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: AUTH_METADATA,
      resourceServerUrl: url,
      scopesSupported: scopes,
      resourceName: name,
    }),
  );

  // Checks the token on every request. No token / bad token -> 401.
  const auth = requireBearerAuth({
    verifier: tokenChecker(url),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(url),
  });

  // Handles MCP messages (discover, tools/list, tools/call). Stateless: new server per request.
  const mcp = toNodeHandler(createMcpHandler(buildServer));

  // Every request: log -> token check (401) -> MCP (403 if a scope is missing).
  app.all(
    url.pathname,
    logRequest(name),
    auth,
    (req, res) => void mcp(req, res, req.body),
  );
  app.listen(Number(url.port), () =>
    console.log(`${name.padEnd(17)} ${url.href}`),
  );
}

// Prints one line per request: server, message, user, status.
function logRequest(name) {
  return (req, res, next) => {
    const msg = req.body ?? {};
    const what =
      msg.method === "tools/call"
        ? `tools/call ${msg.params?.name}`
        : (msg.method ?? req.method);
    res.on("finish", () => {
      const who = req.auth ? ` (${req.auth.clientId})` : "";
      console.log(`[${name}] ${what}${who} -> ${res.statusCode}`);
    });
    next();
  };
}

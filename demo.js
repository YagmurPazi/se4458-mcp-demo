// npm run demo: runs the 4 scenarios, press Enter for the next one
// no LLM here, the script plays the host and calls the tools

import { createInterface } from "node:readline/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { decodeJwt } from "jose";
import { AUTH_URL, DEPLOY_URL, GITHUB_URL } from "./config.js";

// colorful outputs
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

// get a token from the auth server (no login, simplified)
async function getToken(user, resource, scope) {
  const res = await fetch(`${AUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, resource: resource.href, scope }),
  });
  const { access_token } = await res.json();
  // only reads aud and scope to print them, no check here
  const claims = decodeJwt(access_token);
  console.log(
    dim(
      `  token for ${claims.sub}:  aud = ${claims.aud}   scope = "${claims.scope}"`,
    ),
  );
  return access_token;
}

// connect to an MCP server, the token goes in the Authorization header
async function connect(url, token) {
  const client = new Client(
    { name: "demo-host", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const headers = token ? { Authorization: `Bearer ${token}` } : {}; // no token -> no header (scenario 1)
  // connecting sends the first request: server/discover
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      fetch: showHttp,
    }),
  );
  return client;
}

// print each request's status, and WWW-Authenticate when the server says no
async function showHttp(url, init) {
  const res = await fetch(url, init);
  if (init?.method === "POST") {
    const method = JSON.parse(init.body).method;
    const status = res.ok ? green(res.status) : red(res.status);
    console.log(dim(`  POST ${new URL(url).host} ${method} -> `) + status);
    const challenge = res.headers.get("www-authenticate");
    if (challenge) console.log(dim(`  WWW-Authenticate: ${challenge}`));
  }
  return res;
}

// prints the error in red, 401 and 403 end up here
function fail(err) {
  console.log(red(`  ✗ ${err.constructor.name}: ${err.message}`));
}

// waits for Enter before each scenario
const rl = createInterface({ input: process.stdin, output: process.stdout });
async function scenario(title) {
  if (process.stdin.isTTY) await rl.question(dim("\n[Enter] "));
  console.log(bold(`\n${title}`));
}

// 1. No token -> 401
await scenario("Scenario 1 · No token → 401");
try {
  await connect(GITHUB_URL);
} catch (err) {
  fail(err);
}

// 2. Alice, GitHub token -> list tools, open an issue
await scenario("Scenario 2 · Alice, valid token → issue created");
const aliceGithubToken = await getToken(
  "alice",
  GITHUB_URL,
  "issues:read issues:write",
);
const github = await connect(GITHUB_URL, aliceGithubToken);
const { tools } = await github.listTools();
for (const tool of tools)
  console.log(`  tool: ${tool.name}  ${dim(`"${tool.description}"`)}`);
const created = await github.callTool({
  name: "create_issue",
  arguments: { title: "500 error on /checkout" },
});
console.log(green(`  ✓ ${created.content[0].text}`));

// 3. same token to the Deploy server -> 401 (wrong aud)
await scenario("Scenario 3 · Same token, wrong server → 401");
try {
  await connect(DEPLOY_URL, aliceGithubToken);
} catch (err) {
  fail(err);
}

// 4. Bob asks for staging + prod, gets only staging -> prod 403
await scenario("Scenario 4 · Bob, missing scope → 403");
const bobDeployToken = await getToken(
  "bob",
  DEPLOY_URL,
  "deploy:staging deploy:prod",
);
const deploy = await connect(DEPLOY_URL, bobDeployToken);
const staging = await deploy.callTool({
  name: "deploy",
  arguments: { environment: "staging" },
});
console.log(green(`  ✓ ${staging.content[0].text}`));
try {
  await deploy.callTool({ name: "deploy", arguments: { environment: "prod" } });
} catch (err) {
  fail(err);
}

// close the connections
rl.close();
await Promise.all([github.close(), deploy.close()]);

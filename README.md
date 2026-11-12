# MCP Servers – Multiple Servers, Authentication & Authorization

Demo code for the SE 4458 presentation *"MCP Servers – multiple MCP servers, Authentication & Authorization"*.

A small dev-team setup: an **authorization server** hands out access tokens, and two **MCP servers** (GitHub and Deploy) check those tokens on every request. A script plays the role of the host / MCP client and runs four scenarios that show when a request is accepted (200), rejected as unauthenticated (401) or rejected as unauthorized (403).

## Architecture

```
                    ┌───────────────────────────────────┐
                    │ Authorization server :4000        │
                    │ POST /token -> signed JWT         │
                    └───────────────────────────────────┘
                                      │ public key (/jwks.json)
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│ GitHub MCP server :4001/mcp       │   │ Deploy MCP server :4002/mcp       │
│ list_issues     issues:read       │   │ deploy(staging) deploy:staging    │
│ create_issue    issues:write      │   │ deploy(prod)    deploy:prod       │
└───────────────────────────────────┘   └───────────────────────────────────┘
                  ▲                                       ▲
                  └───── demo.js (host + MCP client) ─────┘
                        Authorization: Bearer <token>
```

Every MCP server checks each request:

1. **Signature, expiry and issuer** of the token (with the authorization server's public key, without calling it).
2. **Audience (`aud`)**: was this token issued for *this* server? If not → `401 invalid_token`.
3. **Scope** required by the tool. If missing → `403 insufficient_scope`.

Users (in `config.js`):

| User  | Role   | Scopes |
|-------|--------|--------|
| alice | senior | `issues:read issues:write deploy:staging deploy:prod` |
| bob   | junior | `issues:read deploy:staging` |

## How a request flows

The steps below follow one request from start to end, using Bob's deploy as the example.

### 1. Getting a token (`auth-server.js`)

The client asks the authorization server for a token:

```
POST http://localhost:4000/token
{ "user": "bob", "resource": "http://localhost:4002/mcp", "scope": "deploy:staging deploy:prod" }
```

- `resource` is the MCP server the token is for. It is written into the token as the audience (`aud`).
- The server keeps only the scopes the user really has. Bob asked for `deploy:prod` too, but he does not have it, so it is dropped.
- The token is a JWT signed with the server's **private key** (RS256) and is valid for 10 minutes. The matching **public key** is published at `/jwks.json`.

Bob's token, decoded:

```json
{
  "iss": "http://localhost:4000",
  "sub": "bob",
  "aud": "http://localhost:4002/mcp",
  "scope": "deploy:staging",
  "exp": 1793200600
}
```

### 2. Calling the MCP server (`demo.js`)

The client connects to the MCP server and sends the token with **every** HTTP request:

```
Authorization: Bearer <token>
```

The MCP messages are `server/discover` (sent first, when connecting), `tools/list` and `tools/call`.

### 3. Token check → 401 (`serve-mcp.js`, `check-token.js`)

Every request to `/mcp` goes through the same chain:

```
log  ->  token check  ->  MCP handler
```

The token check (`requireBearerAuth` from the SDK, calling `check-token.js`):

- No `Authorization` header → `401`.
- Otherwise `jwtVerify` checks the **signature** (with the public key), the **expiry**, the **issuer** and the **audience**. The audience must be this server's own URL.
- Any failure → `401 invalid_token`. The response points the client to the server's metadata, where it can find out who issues tokens:

  ```
  WWW-Authenticate: Bearer error="invalid_token", error_description="token was issued for another server",
                    resource_metadata="http://localhost:4002/.well-known/oauth-protected-resource/mcp"
  ```

- Success → the user and the scopes are passed on to the MCP handler. A request that fails here never reaches a tool.

The public key is downloaded once and cached, so the MCP server does not call the authorization server for each request.

### 4. Scope check → 403 (`github-server.js`, `deploy-server.js`)

Each tool is registered with a name, a description (the model reads it to choose the tool), an input schema and a **scope rule** (`scopeChallenge`). The SDK runs the rule *before* the tool:

| Tool | Scope rule |
|---|---|
| `list_issues` | `requireScopes('issues:read')` |
| `create_issue` | `requireScopes('issues:write')` |
| `deploy` | `needsDeployScope`: `deploy:staging` for staging, `deploy:prod` for prod |

`requireScopes` from the SDK asks for one fixed scope. For `deploy` the scope depends on the `environment` argument, so the rule is written by hand.

If the scope is missing, the tool does not run and the server answers `403`:

```
WWW-Authenticate: Bearer error="insufficient_scope", error_description="deploy:prod is required", scope="deploy:prod", ...
```

So Bob's `deploy(staging)` returns "Deployed to staging", and `deploy(prod)` returns `403`.

### 5. Stateless servers

`createMcpHandler` builds a fresh MCP server for every request and keeps no session. The token carries everything the server needs, so any copy of the server can answer any request, and adding more instances is enough to handle more load.

### 401 vs 403

| Code | Meaning | Where |
|---|---|---|
| `401 Unauthorized` | "I don't know you": no token, or the token is invalid / for another server | token check (`check-token.js`) |
| `403 Forbidden` | "I know you, but you are not allowed": the token is valid but a scope is missing | tool scope rule |

The SDK sends both responses; the rules (token check, scope per tool) are in this repository.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
```

Terminal 1, start the three servers:

```bash
npm start
```

Terminal 2, run the scenarios (press Enter before each one):

```bash
npm run demo
```

Issues are kept in memory and numbering starts at #42. Restart `npm start` to reset it.

## Scenarios

| # | What happens | Result |
|---|---|---|
| 1 | Call the GitHub MCP server without a token | `401` + `WWW-Authenticate` with a `resource_metadata` link |
| 2 | Alice gets a token for the GitHub server, lists the tools and calls `create_issue` | `200`, "Issue #42 created" |
| 3 | Alice sends the same token to the Deploy server | `401`, "token was issued for another server" (wrong audience) |
| 4 | Bob asks for `deploy:staging deploy:prod` but only gets `deploy:staging` | staging `200`, prod `403 insufficient_scope` (`deploy:prod`) |

### Example output

`npm run demo` right after `npm start` (the `[Enter]` prompts are left out):

```
Scenario 1 · No token → 401
  POST localhost:4001 server/discover -> 401
  WWW-Authenticate: Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="http://localhost:4001/.well-known/oauth-protected-resource/mcp"
  ✗ SdkHttpError: Version negotiation failed: the server requires authorization (HTTP 401)

Scenario 2 · Alice, valid token → issue created
  token for alice:  aud = http://localhost:4001/mcp   scope = "issues:read issues:write"
  POST localhost:4001 server/discover -> 200
  POST localhost:4001 tools/list -> 200
  tool: list_issues  "List the open issues of the repository"
  tool: create_issue  "Open a new issue in the repository"
  POST localhost:4001 tools/call -> 200
  ✓ Issue #42 created

Scenario 3 · Same token, wrong server → 401
  POST localhost:4002 server/discover -> 401
  WWW-Authenticate: Bearer error="invalid_token", error_description="token was issued for another server", resource_metadata="http://localhost:4002/.well-known/oauth-protected-resource/mcp"
  ✗ SdkHttpError: Version negotiation failed: the server requires authorization (HTTP 401)

Scenario 4 · Bob, missing scope → 403
  token for bob:  aud = http://localhost:4002/mcp   scope = "deploy:staging"
  POST localhost:4002 server/discover -> 200
  POST localhost:4002 tools/call -> 200
  ✓ Deployed to staging
  POST localhost:4002 tools/call -> 403
  WWW-Authenticate: Bearer error="insufficient_scope", error_description="deploy:prod is required", scope="deploy:prod", resource_metadata="http://localhost:4002/.well-known/oauth-protected-resource/mcp"
  ✗ InsufficientScopeError: Insufficient scope: required "deploy:prod"
```

The `✗` lines are expected: the client reports the 401 and 403 answers as errors, and the script prints them and moves on.

The metadata documents can also be opened in a browser while `npm start` is running:

- http://localhost:4001/.well-known/oauth-protected-resource/mcp (RFC 9728)
- http://localhost:4000/.well-known/oauth-authorization-server (RFC 8414)
- http://localhost:4000/jwks.json (public key)

## Files

| File | Purpose |
|---|---|
| `config.js` | Ports, users and their scopes |
| `auth-server.js` | Authorization server: `POST /token` returns a signed JWT (`sub`, `aud`, `scope`, `exp`) |
| `check-token.js` | Token check run by every MCP server on every request: signature, expiry, issuer, audience |
| `serve-mcp.js` | Starts one protected MCP server: metadata endpoint, bearer-token check (401), request log |
| `github-server.js` | `list_issues` (`issues:read`) and `create_issue` (`issues:write`) |
| `deploy-server.js` | `deploy` tool: `deploy:staging` for staging, `deploy:prod` for prod |
| `demo.js` | The four scenarios. There is no LLM: the script decides which tool to call |

## Simplifications

- **No login page.** `POST /token` takes a user name and returns a token directly. A real OAuth 2.1 flow has a browser login with PKCE.
- **Fake back ends.** Issues are kept in memory and `deploy` only returns a message; nothing calls the real GitHub API.

The token format, the audience and scope checks, the 401/403 responses and the `WWW-Authenticate` headers are real.

## Built with

- [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/server`, `client`, `express`, `node`), MCP specification 2026-07-28
- [jose](https://github.com/panva/jose) for signing and verifying JWTs
- Express 5, zod 4

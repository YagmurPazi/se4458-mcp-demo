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

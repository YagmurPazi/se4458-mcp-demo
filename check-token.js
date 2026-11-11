// The token check every MCP server runs on every request.
// The SDK's requireBearerAuth calls this and turns a thrown OAuthError into 401.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import { AUTH_URL } from "./config.js";

const publicKeys = createRemoteJWKSet(new URL(`${AUTH_URL}/jwks.json`));

export function tokenChecker(serverUrl) {
  // each mcp has a different serverUrl
  //example: GitHub: localhost:4001/mcp
  //         Deploy: localhost:4002/mcp
  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, publicKeys, {
          issuer: AUTH_URL, // signed by our authorization server?
          audience: serverUrl.href, // issued for THIS server?  (expiry is checked too)
        });
        return {
          token,
          clientId: payload.sub, // "bob"
          scopes: payload.scope ? payload.scope.split(" ") : [], // ["deploy:staging"]
          // used later by the tool's scopeChallenge -> 403 if a scope is missing
          expiresAt: payload.exp,
          resource: new URL(payload.aud),
        };
      } catch (err) {
        const reason =
          err.claim === "aud" //scenario 3
            ? "token was issued for another server"
            : err.message;
        throw new OAuthError(OAuthErrorCode.InvalidToken, reason); //401
      }
    },
  };
}

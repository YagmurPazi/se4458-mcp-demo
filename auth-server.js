// Authorization server: hands out signed access tokens (JWT).
// Simplified: no login page. In real OAuth the user logs in in the browser first.

import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { AUTH_METADATA, AUTH_URL, USERS } from "./config.js";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const publicJwk = {
  ...(await exportJWK(publicKey)),
  kid: "demo-key",
  alg: "RS256",
};

// Create web server
const app = express();
app.use(express.json());

// RFC 8414: where to find the token endpoint and the public key.
app.get("/.well-known/oauth-authorization-server", (req, res) =>
  res.json(AUTH_METADATA),
);

// Public key: MCP servers use it to check the token signature without calling us.
app.get("/jwks.json", (req, res) => res.json({ keys: [publicJwk] }));

// POST /token { user, resource, scope }
//   resource: which server the token is for
//   scope: requested; the user only gets what they are allowed
app.post("/token", async (req, res) => {
  const { user, resource, scope = "" } = req.body;
  const allowed = USERS[user];
  if (!allowed)
    return res
      .status(400)
      .json({ error: "invalid_grant", error_description: "unknown user" });
  if (!resource)
    return res.status(400).json({
      error: "invalid_target",
      error_description: "resource is required",
    });

  // keep only the scopes this user is allowed to have - scope: permissions inside the token
  const requested = scope.split(" ").filter(Boolean);
  const granted = requested.length
    ? requested.filter((s) => allowed.includes(s))
    : allowed;

  //token created and signed
  const accessToken = await new SignJWT({ scope: granted.join(" ") })
    .setProtectedHeader({ alg: "RS256", kid: "demo-key" })
    .setIssuer(AUTH_URL)
    .setSubject(user)
    .setAudience(resource)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 600,
    scope: granted.join(" "),
  });
});

app.listen(4000, () => console.log(`Auth server       ${AUTH_URL}`));

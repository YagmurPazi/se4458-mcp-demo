// Addresses of the three demo programs and the two demo users.

export const AUTH_URL = 'http://localhost:4000';
export const GITHUB_URL = new URL('http://localhost:4001/mcp');
export const DEPLOY_URL = new URL('http://localhost:4002/mcp');

// RFC 8414 metadata of the authorization server (also mirrored by the MCP servers).
export const AUTH_METADATA = {
  issuer: AUTH_URL,
  authorization_endpoint: `${AUTH_URL}/authorize`, // not implemented: the demo skips the browser login
  token_endpoint: `${AUTH_URL}/token`,
  jwks_uri: `${AUTH_URL}/jwks.json`,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256']
};

// What each user is allowed to do (their scopes).
export const USERS = {
  alice: ['issues:read', 'issues:write', 'deploy:staging', 'deploy:prod'], // senior
  bob: ['issues:read', 'deploy:staging'] // junior
};

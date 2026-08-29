# OAuth2 Client Credentials Authentication

This document describes how to use OAuth2 client credentials flow for API authentication in Bridge Watch.

## Overview

Bridge Watch supports two authentication methods:

1. **API Key Authentication**: Direct authentication using `x-api-key` header
2. **OAuth2 Client Credentials**: Token-based authentication using JWT tokens

The OAuth2 flow reduces database load by validating JWT tokens locally without querying the database on every request.

## Enabling OAuth2 for an API Key

When creating a new API key through the admin interface:

1. Navigate to the API Keys page
2. Fill in the key details (name, scopes, rate limits, expiry)
3. Check the "Enable OAuth2 Client Credentials" checkbox
4. Click "Create API key"

You'll receive three credentials:
- **API Key**: Traditional key for `x-api-key` header authentication
- **Client ID**: OAuth2 client identifier (starts with `bw_`)
- **Client Secret**: OAuth2 client secret (starts with `bws_`)

**Important**: Save these credentials immediately. They are only shown once.

## Obtaining an Access Token

Use the client credentials to obtain a JWT access token:

```bash
curl -X POST https://your-api.com/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "bw_1234567890abcdef",
    "client_secret": "bws_abcdef1234567890...",
    "scope": "jobs:read jobs:trigger"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "jobs:read jobs:trigger"
}
```

## Using the Access Token

Include the token in the `Authorization` header:

```bash
curl https://your-api.com/api/v1/jobs \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Token Properties

- **Algorithm**: HS256 (HMAC SHA-256)
- **Default TTL**: 3600 seconds (1 hour)
- **Issuer**: bridge-watch-api
- **Audience**: bridge-watch-api
- **Subject**: API key ID
- **Scope**: Space-separated list of granted scopes

## Configuration

Set these environment variables to configure JWT tokens:

```bash
# Required: Secret key for signing tokens (generate with: openssl rand -hex 32)
JWT_SECRET=your-secret-key-here

# Optional: Customize JWT properties
JWT_ISSUER=bridge-watch-api
JWT_AUDIENCE=bridge-watch-api
JWT_TTL_SECONDS=3600
```

## Scope Validation

Both authentication methods support scope-based authorization. The token includes all scopes granted to the API key. If you request specific scopes during token issuance, only the intersection of requested and granted scopes will be included in the token.

## Error Responses

### Invalid Client Credentials

```json
{
  "error": "invalid_client",
  "error_description": "Invalid client credentials"
}
```

### Unsupported Grant Type

```json
{
  "error": "unsupported_grant_type",
  "error_description": "Only 'client_credentials' grant type is supported"
}
```

### Invalid Scope

```json
{
  "error": "invalid_scope",
  "error_description": "Requested scopes are not authorized for this client"
}
```

### Invalid or Expired Token

When using the token:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

## Security Best Practices

1. **Store secrets securely**: Never commit `JWT_SECRET` to version control
2. **Rotate tokens regularly**: Access tokens expire after the configured TTL
3. **Use HTTPS**: Always use HTTPS in production to prevent token interception
4. **Scope principle of least privilege**: Grant only the scopes needed for each integration
5. **Monitor usage**: Review API key audit logs regularly

## Migration from API Keys

OAuth2 is fully backward compatible. Existing integrations using API keys continue to work. You can migrate to OAuth2 gradually:

1. Enable OAuth2 for existing keys (requires key rotation)
2. Update your applications to use OAuth2 flow
3. Test thoroughly before decommissioning old API key usage

## Troubleshooting

### Token Validation Fails

- Ensure `JWT_SECRET` is consistent across all server instances
- Check that the token hasn't expired
- Verify the token includes required scopes

### Cannot Obtain Token

- Verify client credentials are correct
- Check that the API key hasn't been revoked
- Ensure the API key hasn't expired

### Performance Issues

- OAuth2 tokens are validated locally (no DB queries)
- If using API keys, consider migrating to OAuth2 for better performance
- Monitor token refresh patterns to optimize TTL settings

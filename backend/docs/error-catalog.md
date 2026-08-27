# Structured Error Catalog

The Structured Error Catalog provides a centralized, machine-readable registry of all error codes, messages, and remediation steps. This enables consistent error handling, better user experiences, and easier troubleshooting across the platform.

## Features

### Core Capabilities

1. **Centralized Error Registry**
   - Single source of truth for all error codes
   - Structured error definitions with code, title, description
   - HTTP status code mapping
   - Category-based organization

2. **Error Categories**
   - `authentication`: Auth-related errors (401)
   - `authorization`: Permission errors (403)
   - `validation`: Input validation failures (400)
   - `not_found`: Resource not found errors (404)
   - `rate_limit`: Rate limiting errors (429)
   - `service_unavailable`: External service failures (503)
   - `internal`: Internal server errors (500)

3. **Remediation Guidance**
   - Step-by-step fix instructions
   - Link to relevant documentation
   - Contact support information
   - Retry-ability indicator

4. **Public Lookup API**
   - No authentication required
   - Lookup by error code
   - List all errors by category
   - Supports frontend error rendering

5. **Admin Management**
   - Create new error definitions
   - Update existing entries
   - Soft-delete obsolete codes
   - Search and filter catalog

6. **Metrics Integration**
   - Counter: `error_catalog_lookups_total`
   - Labels: error_code, category
   - Track error code usage patterns

## Architecture

### Database Schema

**Table: `error_catalog`**

```sql
CREATE TABLE error_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_code VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'authentication', 'authorization', 'validation', 
    'not_found', 'rate_limit', 'service_unavailable', 'internal'
  )),
  http_status_code INTEGER NOT NULL,
  remediation_steps JSONB,
  docs_link TEXT,
  is_retryable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_error_catalog_code ON error_catalog(error_code);
CREATE INDEX idx_error_catalog_category ON error_catalog(category);
CREATE INDEX idx_error_catalog_active ON error_catalog(is_active);
```

### Service Layer

**`errorCatalog.service.ts`**

Singleton service providing:

- `getAllErrors(category?, includeInactive?)`: Fetch error definitions
- `getErrorByCode(code)`: Lookup single error by code
- `createError(definition)`: Add new error to catalog
- `updateError(id, updates)`: Modify existing error
- `deleteError(id)`: Soft-delete error (sets `is_active = false`)

### Error Response Format

All API errors return a consistent structure:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "title": "Invalid API key",
    "message": "The provided API key is invalid or has expired",
    "category": "authentication",
    "statusCode": 401,
    "remediationSteps": [
      "Verify your API key is correctly copied",
      "Check if the API key has expired",
      "Generate a new API key from the admin dashboard"
    ],
    "docsLink": "https://docs.bridgewatch.io/authentication",
    "isRetryable": false
  }
}
```

## API Endpoints

### GET /api/v1/error-catalog

Public lookup endpoint — no authentication required.

**Query Parameters:**
- `code`: Error code to lookup (optional)
- `category`: Filter by category (optional)

**Response (single error):**

```json
{
  "error": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "errorCode": "BRIDGE_NOT_FOUND",
    "title": "Bridge not found",
    "description": "The specified bridge identifier does not exist in the system",
    "category": "not_found",
    "httpStatusCode": 404,
    "remediationSteps": [
      "Verify the bridge ID is correct",
      "Check the list of available bridges at /api/v1/bridges",
      "Contact support if the bridge should exist"
    ],
    "docsLink": "https://docs.bridgewatch.io/bridges",
    "isRetryable": false
  }
}
```

**Response (list by category):**

```json
{
  "errors": [
    {
      "id": "...",
      "errorCode": "INVALID_API_KEY",
      "title": "Invalid API key",
      /* ... */
    },
    {
      "id": "...",
      "errorCode": "EXPIRED_TOKEN",
      "title": "Expired authentication token",
      /* ... */
    }
  ],
  "category": "authentication",
  "total": 2
}
```

### GET /api/v1/admin/error-catalog

Get all errors (admin view, includes inactive).

**Headers:**
- `x-api-key`: Admin API key (required)

**Query Parameters:**
- `category`: Filter by category (optional)
- `includeInactive`: Include soft-deleted errors (default: false)

**Response:**

```json
{
  "errors": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "errorCode": "INVALID_API_KEY",
      "title": "Invalid API key",
      "description": "The provided API key is invalid or has expired",
      "category": "authentication",
      "httpStatusCode": 401,
      "remediationSteps": ["Step 1", "Step 2"],
      "docsLink": "https://docs.bridgewatch.io/authentication",
      "isRetryable": false,
      "isActive": true,
      "createdBy": "admin",
      "createdAt": "2026-08-20T10:00:00Z",
      "updatedAt": "2026-08-20T10:00:00Z"
    }
  ]
}
```

### POST /api/v1/admin/error-catalog

Create a new error definition.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "errorCode": "INSUFFICIENT_BALANCE",
  "title": "Insufficient balance",
  "description": "The wallet does not have enough balance to complete the transaction",
  "category": "validation",
  "httpStatusCode": 400,
  "remediationSteps": [
    "Check your wallet balance",
    "Ensure you have enough funds including fees",
    "Wait for pending transactions to confirm"
  ],
  "docsLink": "https://docs.bridgewatch.io/transactions#fees",
  "isRetryable": false
}
```

**Validation:**
- `errorCode`: Required, unique, uppercase with underscores
- `title`: Required, 1-255 characters
- `description`: Required
- `category`: Required, must be valid category
- `httpStatusCode`: Required, valid HTTP status code
- `remediationSteps`: Optional array of strings
- `isRetryable`: Optional boolean, defaults to false

**Response:**

```json
{
  "error": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "errorCode": "INSUFFICIENT_BALANCE",
    /* ... */
  }
}
```

### PATCH /api/v1/admin/error-catalog/:id

Update an existing error definition.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "description": "Updated description text",
  "remediationSteps": ["New step 1", "New step 2"]
}
```

**Response:**

```json
{
  "error": {
    /* updated error object */
  }
}
```

### DELETE /api/v1/admin/error-catalog/:id

Soft-delete an error definition (sets `is_active = false`).

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "message": "Error definition deactivated"
}
```

## Frontend Admin UI

**Location:** `/admin/error-catalog`

### Features

1. **Errors Table**
   - Columns: Code, Title, Category, Status Code, Status
   - Category badge with color coding
   - Active/inactive indicator
   - Expandable row to show full description and remediation steps

2. **Category Filter**
   - Dropdown to filter by category
   - "All categories" option
   - Includes inactive errors toggle

3. **Create Form**
   - Error code input (uppercase validation)
   - Title and description fields
   - Category selector
   - HTTP status code input
   - Remediation steps (multi-line textarea, one per line)
   - Documentation link input
   - Retryable checkbox

4. **Actions**
   - Edit button per error
   - Delete (deactivate) button
   - Refresh button

5. **Error Details Panel**
   - Shows complete error definition
   - Formatted remediation steps
   - Clickable docs link

## Usage Examples

### Example 1: Lookup error in frontend

```typescript
async function displayError(errorCode: string) {
  const response = await fetch(
    `/api/v1/error-catalog?code=${errorCode}`
  );
  const { error } = await response.json();
  
  // Display error to user
  console.error(error.title);
  console.log("How to fix:", error.remediationSteps);
}
```

### Example 2: Create authentication error

```bash
curl -X POST http://localhost:3001/api/v1/admin/error-catalog \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "errorCode": "SESSION_EXPIRED",
    "title": "Session expired",
    "description": "Your authentication session has expired. Please log in again.",
    "category": "authentication",
    "httpStatusCode": 401,
    "remediationSteps": [
      "Click the login button",
      "Enter your credentials",
      "If using API key, regenerate from dashboard"
    ],
    "docsLink": "https://docs.bridgewatch.io/authentication#sessions",
    "isRetryable": true
  }'
```

### Example 3: List all validation errors

```bash
curl http://localhost:3001/api/v1/error-catalog?category=validation
```

## Integration with API Error Handling

### Throwing Catalog Errors

```typescript
import { errorCatalog } from "../services/errorCatalog.service";

// In route handler
const errorDef = await errorCatalog.getErrorByCode("BRIDGE_NOT_FOUND");
if (!bridge) {
  return reply.status(errorDef.httpStatusCode).send({
    error: {
      code: errorDef.errorCode,
      title: errorDef.title,
      message: errorDef.description,
      category: errorDef.category,
      statusCode: errorDef.httpStatusCode,
      remediationSteps: errorDef.remediationSteps,
      docsLink: errorDef.docsLink,
      isRetryable: errorDef.isRetryable,
    },
  });
}
```

### Error Response Middleware

Create a reusable error formatter:

```typescript
export function formatCatalogError(errorCode: string, details?: any) {
  const errorDef = errorCatalog.getErrorByCode(errorCode);
  return {
    error: {
      code: errorDef.errorCode,
      title: errorDef.title,
      message: errorDef.description,
      category: errorDef.category,
      statusCode: errorDef.httpStatusCode,
      remediationSteps: errorDef.remediationSteps,
      docsLink: errorDef.docsLink,
      isRetryable: errorDef.isRetryable,
      details, // Optional context-specific details
    },
  };
}
```

## Metrics

**Counter:** `error_catalog_lookups_total`

Labels:
- `error_code`: The error code looked up
- `category`: Error category

Example Prometheus queries:

```promql
# Most frequently looked up errors
topk(10, sum by (error_code) (rate(error_catalog_lookups_total[1h])))

# Lookups by category
sum by (category) (rate(error_catalog_lookups_total[5m]))
```

## Best Practices

### Error Code Naming

1. **Use SCREAMING_SNAKE_CASE**: `INVALID_API_KEY`, `BRIDGE_NOT_FOUND`
2. **Be specific**: Prefer `RATE_LIMIT_EXCEEDED` over `TOO_MANY_REQUESTS`
3. **Namespace by domain**: `STELLAR_TRANSACTION_FAILED`, `ETH_INSUFFICIENT_GAS`
4. **Avoid generic codes**: Don't use `ERROR_001` — use descriptive names

### Remediation Steps

1. **Be actionable**: Tell users exactly what to do
2. **Order by likelihood**: Most common fix first
3. **Include links**: Reference relevant documentation
4. **Avoid jargon**: Write for non-technical users when possible

### HTTP Status Codes

Map categories to appropriate status codes:

- `authentication` → 401
- `authorization` → 403
- `validation` → 400
- `not_found` → 404
- `rate_limit` → 429
- `service_unavailable` → 503
- `internal` → 500

## Testing

Run tests:

```bash
# Unit tests
npm test -- errorCatalog.service.test.ts

# Integration tests
npm test -- errorCatalog.test.ts

# Frontend tests
npm test -- ErrorCatalog.test.tsx

# E2E tests (none yet — catalog is admin-only)
```

## Future Enhancements

1. **I18n support**: Multi-language error messages
2. **Error templates**: Dynamic message interpolation
3. **Related errors**: Link to similar error codes
4. **Error analytics**: Track which errors occur most in production
5. **Auto-documentation**: Generate API docs from catalog
6. **Client SDKs**: Type-safe error handling in TypeScript/Python/Go clients
7. **Slack integration**: Post new errors to engineering channel

## Troubleshooting

### Error code not found

1. Check spelling — codes are case-sensitive
2. Verify error is `is_active = true`
3. Check if error was soft-deleted
4. Review admin catalog for available codes

### Duplicate error code

Error codes must be unique. Use a different code or update the existing definition.

### Public lookup slow

1. Check database query performance (indexed on `error_code`)
2. Verify no N+1 queries in service layer
3. Consider caching frequently-accessed errors in Redis


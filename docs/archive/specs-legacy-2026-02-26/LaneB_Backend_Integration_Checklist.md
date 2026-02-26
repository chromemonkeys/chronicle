# Lane B Backend Integration Checklist

## Scope
This checklist tracks frontend/backend handoff readiness for the current API surface used by Chronicle web.

## Endpoint contract matrix

### `GET /api/health`
- Auth: no
- Success: `200 { "ok": true }`
- Errors: `404` (route missing)
- Frontend use: environment sanity check only

### `GET /api/session`
- Auth: optional bearer token
- Success:
  - `200 { "authenticated": true, "userName": "..." }`
  - `200 { "authenticated": false, "userName": null }`
- Errors:
  - `500 { "error": "..." }`
- Frontend use: boot auth state on app start

### `POST /api/session/login`
- Auth: no
- Request: `{ "name": "Avery" }`
- Success: `200 { "token": "...", "userName": "Avery" }`
- Errors:
  - `400 { "error": "Invalid JSON body" }`
  - `500 { "error": "..." }`
- Frontend use: sign-in

### `POST /api/session/logout`
- Auth: optional bearer token
- Success: `200 { "ok": true }`
- Errors:
  - `500 { "error": "..." }`
- Frontend use: sign-out

### `GET /api/documents`
- Auth: required bearer token
- Success: `200 { "documents": DocumentSummary[] }`
- Errors:
  - `401 { "error": "Unauthorized" }`
  - `500 { "error": "..." }`
- Frontend use: document list page

### `GET /api/documents/:id`
- Auth: required bearer token
- Success: `200 { "document": DocumentSummary }`
- Errors:
  - `401 { "error": "Unauthorized" }`
  - `404 { "error": "Document not found" }`
  - `500 { "error": "..." }`
- Frontend use: document lookup (future deeper detail usage)

### `GET /api/approvals`
- Auth: required bearer token
- Success: `200 ApprovalsResponse`
- Errors:
  - `401 { "error": "Unauthorized" }`
  - `500 { "error": "..." }`
- Frontend use: approvals page

### `GET /api/workspace/:id`
- Auth: required bearer token
- Success: `200 WorkspacePayload`
- Errors:
  - `401 { "error": "Unauthorized" }`
  - `404 { "error": "Workspace document not found" }`
  - `500 { "error": "..." }`
- Frontend use: workspace editor route

## Frontend error normalization
- `401` -> `AUTH_REQUIRED` (clear auth state, redirect to sign-in)
- `403` -> `FORBIDDEN`
- `404` -> `NOT_FOUND`
- `422` -> `VALIDATION_ERROR`
- `5xx` -> `SERVER_ERROR`
- network failure -> `NETWORK_ERROR`

## Handoff status
- [x] Shared TS contract types exist in `src/api/types.ts`
- [x] Shared API client exists in `src/api/client.ts`
- [x] Workspace endpoint added in backend (`/api/workspace/:id`)
- [x] Session/documents/approvals/workspace wired from frontend pages
- [ ] Backend error payload includes stable machine-readable `code` field (future improvement)
- [ ] Replace local auth fallback once backend uptime is guaranteed in dev/prod

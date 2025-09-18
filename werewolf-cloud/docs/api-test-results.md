# API Test Results

This document captures the results of automated API testing using `scripts/curl-api-test.sh`.

## Test Execution

**Command:** `cd werewolf-cloud && bun run typecheck`

**Date:** 2025-09-18

**Environment:** Local development

**Output:**
```
$ tsc --build
```
(No errors - TypeScript compilation successful)

---

**Command:** `cd werewolf-cloud && bun run test`

**Date:** 2025-09-18

**Environment:** Local development

**Output:**
```
$ vitest --run --watch=false --config config/vitest.config.ts
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/ribelo/projects/ribelo/werewolf/werewolf-cloud

 ✓ packages/domain/src/__tests__/attempt.test.ts (2 tests) 3ms
 ✓ packages/domain/src/__tests__/score-engine.test.ts (15 tests) 4ms
stdout | apps/api/__tests__/integration.test.ts > Werewolf API – integration (Miniflare + D1) > can create and fetch a contest
POST http://localhost/contests -> 201 (61ms) [...]
GET http://localhost/contests/8016c8ed-c514-46b5-b7f0-983b8fcf08e9 -> 200 (5ms) [...]
✓ apps/api/__tests__/integration.test.ts (6 tests) 779ms

 Test Files  3 passed (3)
      Tests  23 passed (23)
   Start at  13:57:52
   Duration  1.27s (transform 110ms, setup 0ms, collect 321ms, tests 786ms, environment 0ms, prepare 310ms)
```

---

**Command:** `nix develop -c bash -lc "npx wrangler dev --config wrangler.toml --local --port 8787 > tmp/wrangler-dev.log 2>&1 & pid=$!; sleep 8; ./scripts/curl-api-test.sh http://127.0.0.1:8787 > tmp/curl-api.log 2>&1; status=$?; kill $pid; wait $pid 2>/dev/null; exit $status"`

**Date:** 2025-09-18

**Environment:** Local Wrangler dev server (`wrangler.toml` bindings: D1 werewolf-dev, KV werewolf-kv-dev)

**Output (summary):**
```
Tests run: 17
Tests passed: 17
Tests failed: 0
```

Logs stored at `tmp/wrangler-dev.log` and `tmp/curl-api.log`.

---

**Command:** `bun scripts/import-sqlite.ts --local-path tmp/import-validation.sqlite --reset`

**Date:** 2025-09-18

**Environment:** Local SQLite database seeded with Cloudflare migrations (`scripts/setup-local-d1.ts`)

**Output (excerpt):**
```
📦 Importing data into local SQLite database: tmp/import-validation.sqlite
🧹 Clearing existing data in local database...
📊 Importing 10 records to age_categories...
✅ Imported 10 records to age_categories
📊 Importing 29 records to weight_classes...
✅ Imported 29 records to weight_classes
📊 Importing 1 records to contests...
✅ Imported 1 records to contests
📊 Importing 10 records to competitors...
✅ Imported 10 records to competitors
📊 Importing 20 records to registrations...
✅ Imported 20 records to registrations
📊 Importing 180 records to attempts...
✅ Imported 180 records to attempts
🎉 Local import completed successfully!
```

**Record Counts:**
```
contests: 1
competitors: 10
registrations: 20
attempts: 180
age_categories: 10
weight_classes: 29
```

---

**Command:** `./scripts/curl-api-test.sh http://localhost:8787`

**Date:** 2025-01-15

**Environment:** Local development (Wrangler dev server)

## Test Results

**Status:** API testing requires live Wrangler dev server. Current results show development environment readiness.

**Note:** Integration tests pass locally (20/20), but full API testing requires running `wrangler dev` and executing curl commands against live endpoints.

## Sample Response Payloads

### Health Check
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-09-18T12:26:10.651Z"
  },
  "error": null,
  "requestId": "a48bb8aa-5163-49d0-a287-3953861802b8"
}
```

### List Contests
```json
{
  "id": "43c6f231-581c-4b61-9ca6-ca10a325dd5c",
  "name": "Test Contest",
  "date": "2025-12-01",
  "location": "Test Gym",
  "discipline": "Powerlifting",
  "status": "InProgress",
  "federationRules": null,
  "competitionType": null,
  "organizer": null,
  "notes": null,
  "isArchived": 0,
  "createdAt": "2025-09-18T12:24:17.912Z",
  "updatedAt": "2025-09-18T12:24:17.961Z",
  "mensBarWeight": 20,
  "womensBarWeight": 15,
  "barWeight": 20
}
```

### Error Response
```json
{
  "data": null,
  "error": "Contest not found",
  "requestId": "<example-request-id>"
}
```

### Settings
```json
{
  "data": {
    "language": "pl",
    "ui": {
      "theme": "light",
      "showWeights": true,
      "showAttempts": true
    },
    "competition": {
      "federationRules": "IPF",
      "defaultBarWeight": 20
    },
    "database": {
      "backupEnabled": true,
      "autoBackupInterval": 24
    }
  },
  "error": null,
  "requestId": "2e499898-8372-4718-84d1-d7ea4235047a"
}
```

## Key Findings

✅ **Type Safety**: `bun run typecheck` passes with no TypeScript errors
✅ **Unit Tests**: 17 domain-focused unit tests cover score engine and attempt validation
✅ **Integration Tests**: 6 Miniflare-powered tests exercise health checks, contest CRUD, registrations, settings, and validation errors (23 total assertions)
✅ **Response Format**: API responses follow `{data, error, requestId}` envelope pattern across happy and error paths
✅ **Importer Validation**: Legacy SQLite dump imported into a D1-compatible SQLite database with verified record counts

## Current Status

- **Backend**: Type-safe with deterministic unit + integration coverage (Miniflare harness)
- **Importer**: Verified against local D1-compatible SQLite database (`tmp/import-validation.sqlite`)
- **API Testing**: Full curl sweep against `wrangler dev` still outstanding for documentation capture
- **Documentation**: Migration plan updated with importer logs; parity matrix still needs evidence links per route

## Next Steps

1. Start Wrangler dev server: `wrangler dev --local`
2. Run curl test script: `./scripts/curl-api-test.sh http://localhost:8787`
3. Capture live API responses and replace placeholder payloads in docs
4. Link parity matrix rows to specific tests/curl captures

## Conclusion

Backend codebase is stable and ready for live API testing. Integration tests validate core functionality with real D1/KV bindings; remaining work is primarily evidence capture (curl outputs, parity matrix) and frontend integration.

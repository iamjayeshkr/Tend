# Tend Secure Accounts and Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Clerk accounts and a rate-limited Supabase synchronization gateway while preserving Tend's offline guest experience and schema-1 data.

**Architecture:** The React/Vite client keeps account-scoped IndexedDB as its immediate source of truth and records every signed-in mutation in an atomic durable queue. Clerk supplies identity; Supabase Edge Functions authenticate and rate-limit requests, and narrowly scoped PostgreSQL operations provide idempotent push/pull, RLS isolation, revisions, tombstones, conflicts, devices, export, and deletion.

**Tech Stack:** React 19.2.4, TypeScript 5.9.3, Vite 7.3.1, Clerk React 6.17.8, Clerk Backend 3.23.2, Supabase JS 2.117.3, Supabase CLI 2.120.0, Zod 4.6.7, Upstash Redis 1.39.0, Upstash Ratelimit 2.2.0, Vitest 4.0.18, Playwright 1.58.2, PGlite 0.5.9.

**Spec:** `docs/superpowers/specs/2026-10-13-tend-secure-sync-auth-design.md`

## Global Constraints

- Desktop/web is the only cloud-enabled client in this plan; Android remains offline and receives no Internet permission.
- Guest mode must work without provider keys or a network connection.
- Preserve the schema-1 `AppState` and backup contract; sync metadata lives beside it, not inside exported state.
- Browser configuration contains only `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Tokens and server secrets never enter localStorage, IndexedDB snapshots, Tend backups, logs, analytics, source control, built assets, or Android assets.
- Owner identity always comes from a verified Clerk token subject and is never trusted from a payload.
- Direct browser insert, update, and delete grants on sync tables remain denied.
- Every account table has explicit grants, forced RLS where supported, and ownership predicates using `(select auth.jwt()->>'sub')`.
- New dependencies use exact versions and the committed npm lockfile; do not run forced audit remediation.
- Push batches contain at most 100 operations. Initial limits are pull 120/minute, push 30/minute, migration 3/hour, export 5/hour, revocation 10/hour, and deletion 3/hour.
- Tombstones and idempotency results retain for 30 days; conflicts and security events retain for 90 days; guest recovery snapshots retain for 30 days or explicit removal.
- No supported conflict path silently discards user content.
- Every task follows red-green-refactor, ends with its focused verification, and leaves the current offline baseline runnable.

## Review Focus

1. **Account/device/IP limiter bypass:** rotating a device id must still hit the account or IP limit; Task 10 adds the multi-dimension test.
2. **Sign-out with pending writes:** the app must not purge or hide unsynchronized changes without a successful sync or recovery export; Task 14 adds this browser test.
3. **Expired session while offline:** account data must lock rather than appear as guest data or another account; Task 7 adds this workspace test.
4. **Pull page committed but cursor not committed:** restart must replay the page without skipping or duplicating records; Task 13 adds this crash-boundary test.
5. **Deletion interrupted between database and Clerk:** retry must resume idempotently and the webhook must finish cleanup; Task 18 adds this integration test.

---

## File and module map

```text
src/security/env.ts                  public environment parser; no secret access
src/auth/types.ts                    identity/session interface consumed by the app
src/auth/TendAuthProvider.tsx        optional Clerk provider with guest fallback
src/auth/AuthControls.tsx            sign-in, user, and sign-out controls
src/data/indexedDb.ts                IndexedDB v2 schema and transactions
src/data/localRepository.ts          workspace snapshots, queue, metadata, recovery
src/data/workspaceManager.ts         guest/account switching and cache lock rules
src/sync/types.ts                    public sync protocol types
src/sync/schemas.ts                  collection and envelope validation
src/sync/recordAdapter.ts            AppState ↔ record conversion and operation diff
src/sync/gatewayClient.ts            authenticated Edge Function client
src/sync/syncEngine.ts               push/pull/retry/cursor coordinator
src/sync/conflicts.ts                deterministic merge and conflict preservation
src/sync/SyncStatus.tsx              user-visible offline/sync/conflict state
src/auth/GuestMigrationDialog.tsx    preview, confirmation, progress, rollback
src/auth/AccountPanel.tsx            devices, export, revocation, deletion UI
supabase/config.toml                 local Supabase project configuration
supabase/migrations/                 generated schema and function migrations
supabase/functions/_shared/          auth, HTTP, validation, database, rate, audit
supabase/functions/sync/index.ts     push and pull transport adapter
supabase/functions/account/index.ts  devices, export, revocation, deletion adapter
supabase/functions/clerk-webhook/    signed lifecycle cleanup adapter
tests/database/                      migration, grant, RLS, and function tests
tests/sync/                          two-device and gateway integration tests
tests/auth/                          credential-backed Clerk browser tests
```

### Task 1: Pin provider and test tooling safely

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: existing npm scripts and Node 24.19.0 environment.
- Produces: exact dependency graph and named scripts used by every later task.

- [ ] **Step 1: Record the clean dependency baseline**

Run: `npm audit --audit-level=high && npm run typecheck && npm run test:unit`

Expected: audit has no high/critical finding, type-check passes, and 40 unit tests pass.

- [ ] **Step 2: Inspect package metadata and install with scripts disabled**

Run exact-version installs with `--save-exact --ignore-scripts` for `@clerk/react@6.17.8`, `@supabase/supabase-js@2.117.3`, `zod@4.6.7`, plus dev packages `@clerk/backend@3.23.2`, `@clerk/testing@2.2.45`, `@electric-sql/pglite@0.5.9`, `@upstash/redis@1.39.0`, `@upstash/ratelimit@2.2.0`, `fake-indexeddb@6.2.5`, and `supabase@2.120.0`.

Expected: only the named exact versions and their transitives change the lockfile; inspect the `supabase` package contents before permitting its CLI binary setup.

- [ ] **Step 3: Add stable scripts and secret exclusions**

Add `backend:start`, `backend:stop`, `backend:reset`, `backend:check`, `test:database`, `test:sync`, `test:auth`, and `test:security`. Gitignore `.env`, `.env.*`, Supabase temp state, and generated coverage while explicitly allowing `.env.example`.

- [ ] **Step 4: Commit a placeholder-only environment contract**

`.env.example` names public browser values, Edge-only values, exact allowed origins, and credential-backed test values without sample keys that resemble secrets.

- [ ] **Step 5: Verify and commit**

Run: `npm ci --ignore-scripts && npm audit --audit-level=high && npm run typecheck && npm run test:unit`

Expected: clean install, no reachable high/critical advisory, and baseline tests pass.

Commit: `build: pin secure sync dependencies`

### Task 2: Enforce the public environment boundary

**Files:**
- Create: `src/security/env.ts`
- Create: `src/security/env.test.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: Vite `ImportMetaEnv` strings.
- Produces: `readPublicEnvironment(source: Record<string, unknown>): PublicEnvironment` where `PublicEnvironment` is `{ cloud: { clerkPublishableKey: string; supabaseUrl: URL; supabasePublishableKey: string } | null }`.

- [ ] **Step 1: Write failing environment tests**

Test `returns cloud null when all three public values are absent`, `rejects a partial configuration`, `requires https except loopback development`, and `does not define server-secret names on ImportMetaEnv`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run src/security/env.test.ts`

Expected: FAIL because `readPublicEnvironment` does not exist.

- [ ] **Step 3: Implement the parser and Vite types**

Reject whitespace, invalid URLs, non-publishable key shapes, and partial configuration. Do not read `CLERK_SECRET_KEY`, Supabase service keys, Redis tokens, or webhook secrets.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/security/env.test.ts && npm run typecheck`

Expected: PASS.

Commit: `feat: define Tend public environment boundary`

### Task 3: Add optional Clerk identity without breaking guest mode

**Files:**
- Create: `src/auth/types.ts`
- Create: `src/auth/TendAuthProvider.tsx`
- Create: `src/auth/AuthControls.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PublicEnvironment` from Task 2 and Clerk `isLoaded`, `isSignedIn`, `userId`, `getToken`, `signOut`.
- Produces: `useTendIdentity(): TendIdentity`, discriminated as `guest`, `loading`, `signedIn`, or `locked`; `getAccessToken(): Promise<string | null>` exists only on `signedIn`.

- [ ] **Step 1: Add the failing guest-regression browser assertion**

Extend the first-run Playwright journey to start with no cloud variables and assert onboarding and every local save still work while account controls explain that cloud sync is optional.

- [ ] **Step 2: Verify the new assertion fails**

Run: `npm run build && npx playwright test tests/e2e.spec.ts --project=desktop --grep "guided first run"`

Expected: FAIL because optional account controls do not exist.

- [ ] **Step 3: Initialize and review Clerk scaffolding**

Run: `npx -y clerk@3.4.1 init`

Expected: CLI detects React/Vite, provisions temporary development keys when signed out, and reports the env filename and claim instruction. Review every mutation; retain only the current `@clerk/react` provider integration and environment values. Never print or commit the env file.

- [ ] **Step 4: Implement the identity boundary and calm account controls**

Wrap Clerk only when complete public configuration exists. Guard all Clerk state on `isLoaded`. Keep onboarding and all four primary destinations usable in `guest` state. Do not add route protection to local features.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run test:unit && npm run build && npx playwright test tests/e2e.spec.ts --project=desktop --grep "guided first run" && npx -y clerk@3.4.1 doctor --json`

Expected: offline guest journey passes; Clerk doctor reports a valid provider when temporary keys exist or reports only the documented missing-key state when they do not.

Commit: `feat: add optional Clerk identity shell`

### Task 4: Define and validate the sync protocol

**Files:**
- Create: `src/sync/types.ts`
- Create: `src/sync/schemas.ts`
- Create: `src/sync/schemas.test.ts`

**Interfaces:**
- Consumes: schema-1 domain field limits from `src/core.ts`.
- Produces: `TendCollection`, `SyncOperation`, `DeviceRegistration`, `PushRequest`, `PushResponse`, `PullRequest`, `PullResponse`, `ValidateMigrationRequest`, `ValidateMigrationResponse`, `RemoteRecord`, `ApiError`, and `parse*` boundary functions.

- [ ] **Step 1: Write failing protocol tests**

Cover all nine allowlisted collections, 100-operation maximum, unknown-field rejection, UUID/date/revision checks, request-size-independent structural depth limits, device-private setting rejection, and canonical operation request hashing.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/sync/schemas.test.ts`

Expected: FAIL because protocol types and parsers do not exist.

- [ ] **Step 3: Implement schemas and canonical hashing input**

Define `canonicalOperation(operation: SyncOperation): string` with stable key ordering and no transport-only fields. The cryptographic hash is computed by callers using Web Crypto.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/sync/schemas.test.ts && npm run typecheck`

Expected: PASS.

Commit: `feat: define validated sync protocol`

### Task 5: Convert schema-1 state into stable records and operations

**Files:**
- Create: `src/sync/recordAdapter.ts`
- Create: `src/sync/recordAdapter.test.ts`

**Interfaces:**
- Consumes: `AppState`, `RemoteRecord`, and protocol types from Task 4.
- Produces: `stateToRecords(state: AppState): Map<string, LocalRecord>`, `recordsToState(base: AppState, records: Iterable<RemoteRecord>): AppState`, and `diffRecords(previous, next, metadata): SyncOperation[]`.

- [ ] **Step 1: Write failing record conversion tests**

Assert round-trip equality for the complete schema-1 fixture, stable record ids, per-setting records, excluded active timer/parental PIN/restricted packages/permission state, deterministic create/patch/delete operations, and one completion operation for one focus activity.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/sync/recordAdapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter**

Use existing UUIDs; derive deterministic ids for date-keyed logs and individual settings. Validate the reconstructed aggregate with `validateState` before returning it.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/sync/recordAdapter.test.ts src/core.test.ts && npm run typecheck`

Expected: PASS with the original backup contract unchanged.

Commit: `feat: map Tend state to sync records`

### Task 6: Add atomic account-scoped IndexedDB storage

**Files:**
- Create: `src/data/indexedDb.ts`
- Create: `src/data/localRepository.ts`
- Create: `src/data/localRepository.test.ts`
- Modify: `src/core.ts`

**Interfaces:**
- Consumes: `AppState` and `SyncOperation`.
- Produces: `LocalRepository.open()`, `loadWorkspace(id)`, `commit(id, previous, next, operations)`, `readPending(id, limit)`, `acknowledge(id, result, pullCursor)`, `saveRecoverySnapshot`, and `deleteWorkspace`.

- [ ] **Step 1: Write failing IndexedDB migration and atomicity tests**

Using `fake-indexeddb`, prove an existing v1 `snapshots/tend.state.v1` value migrates to guest once, snapshot plus queue commit atomically, abort preserves the old snapshot and queue, write order remains serialized, and the localStorage fallback exposes guest-only capability.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/data/localRepository.test.ts`

Expected: FAIL because the v2 repository does not exist.

- [ ] **Step 3: Implement IndexedDB v2 and compatibility wrappers**

Keep exported `loadState()`/`persistState()` behavior for Android and existing tests. Browser calls delegate to the guest workspace until Task 7 supplies identity selection.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/data/localRepository.test.ts src/core.test.ts && npm run typecheck`

Expected: PASS; legacy schema-1 snapshot remains byte-for-byte recoverable.

Commit: `feat: add account-scoped local repository`

### Task 7: Enforce workspace switching and offline lock rules

**Files:**
- Create: `src/data/workspaceManager.ts`
- Create: `src/data/workspaceManager.test.ts`
- Modify: `src/auth/TendAuthProvider.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TendIdentity` and `LocalRepository`.
- Produces: `WorkspaceManager.select(identity)`, `lockAccount(userId)`, `prepareSignOut(userId)`, and `WorkspaceSelection` with `guest`, `account`, or `locked` state.

- [ ] **Step 1: Write failing isolation tests**

Assert account A never loads guest or account B snapshots, an expired same-user session while offline returns `locked`, a new signed-out session returns guest without exposing account data, and pending operations make `prepareSignOut` return `requiresSyncOrExport`.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/data/workspaceManager.test.ts`

Expected: FAIL because the manager does not exist.

- [ ] **Step 3: Implement selection and wire App loading**

Reset React state before changing workspace. Never infer a workspace from an unverified cached user id.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/data/workspaceManager.test.ts src/core.test.ts && npm run typecheck && npm run build`

Expected: PASS.

Commit: `feat: isolate guest and account workspaces`

### Task 8: Create the Supabase schema, grants, and RLS contract

**Files:**
- Create: `supabase/config.toml` via the installed CLI
- Create: `supabase/migrations/<cli-generated>_secure_sync_schema.sql`
- Create: `tests/database/helpers.ts`
- Create: `tests/database/secure-sync.test.ts`

**Interfaces:**
- Consumes: Clerk JWT `sub` and `authenticated` role contract.
- Produces: `user_records`, `devices`, `sync_operations`, `sync_conflicts`, `security_events`, `sync_retention_state`, sequences, indexes, retention columns, explicit grants, and owner policies.

- [ ] **Step 1: Discover CLI commands and initialize config**

Run: `npx supabase --help`, then inspect `npx supabase init --help` and `npx supabase migration new --help` before using them. Create the migration with the CLI; do not invent its filename.

- [ ] **Step 2: Write failing PGlite database tests**

Install the migration into a fresh in-process database with stubbed `auth.jwt()`. Test anon denial; owner select/insert/update/delete policy shape; both update predicates; owner reassignment denial; explicit grants; composite keys; FK/index coverage; check constraints; and User A denial for User B ids, cursors, and conflicts.

- [ ] **Step 3: Confirm failure**

Run: `npm run test:database`

Expected: FAIL before the schema exists or while a required policy/grant is absent.

- [ ] **Step 4: Implement the migration**

Use text Clerk subjects, `timestamptz`, UUID record/device ids, `change_sequence`, short transactions, force RLS where the local engine supports it, and no browser mutation grants.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:database && npm run backend:check`

Expected: PGlite contract passes; static Supabase config/migration validation passes. If hosted credentials are available, also run a clean project reset and Supabase advisors; otherwise record that credential-backed gate as pending, not passed.

Commit: `feat: add secure Supabase sync schema`

### Task 9: Authenticate and bound every gateway request

**Files:**
- Create: `supabase/functions/deno.json`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/http.test.ts`

**Interfaces:**
- Consumes: Web `Request`, Clerk Backend 3.23.2, configured origins/audience/JWT public key.
- Produces: `authenticateRequest(request, config): Promise<VerifiedPrincipal>`, `handlePreflight`, `jsonResponse`, and `ApiFailure` mapping.

- [ ] **Step 1: Write failing request-boundary tests**

Test missing/expired/wrong-issuer/wrong-audience tokens, absent or unapproved `azp`, exact-origin CORS, safe `401/403/413/500` bodies, request id propagation, and absence of auth headers from logs.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/http.test.ts`

Expected: FAIL because the boundary does not exist.

- [ ] **Step 3: Implement Web-standard adapters**

Use `createClerkClient().authenticateRequest()` with `acceptsToken: 'session_token'`, explicit `authorizedParties`, audience, and networkless `CLERK_JWT_KEY`. Reject before reading a large body.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/http.test.ts && npm run typecheck`

Expected: PASS.

Commit: `feat: authenticate sync gateway requests`

### Task 10: Add shared multi-dimensional rate limiting

**Files:**
- Create: `supabase/functions/_shared/rateLimit.ts`
- Create: `supabase/functions/_shared/rateLimit.test.ts`
- Create: `supabase/functions/_shared/audit.ts`

**Interfaces:**
- Consumes: verified owner, device id, normalized client IP, operation class, Redis interface.
- Produces: `enforceRateLimit(input): Promise<RateLimitDecision>` and redacted `recordSecurityEvent(event)`.

- [ ] **Step 1: Write failing limiter tests**

Assert exact spec limits, `Retry-After`, account and IP limits surviving device-id rotation, device fairness, fail-closed destructive operations, bounded degraded ordinary sync, TTLs, and logs containing only event code/request id/pseudonymous identifiers.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/rateLimit.test.ts`

Expected: FAIL because the limiter does not exist.

- [ ] **Step 3: Implement injected Redis-backed policies**

Use Upstash only through a small interface so tests use a deterministic fake. Never trust `X-Forwarded-For` except from the documented Supabase gateway header chain.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/rateLimit.test.ts`

Expected: PASS.

Commit: `feat: enforce shared gateway rate limits`

### Task 11: Implement idempotent push through a narrow mutation API

**Files:**
- Create: `supabase/migrations/<cli-generated>_sync_mutation_functions.sql`
- Create: `supabase/functions/_shared/database.ts`
- Create: `supabase/functions/_shared/pushService.ts`
- Create: `supabase/functions/_shared/pushService.test.ts`
- Create: `supabase/functions/sync/index.ts`

**Interfaces:**
- Consumes: `VerifiedPrincipal`, parsed `PushRequest`, limiter, Supabase server client.
- Produces: `registerDevice`, `validateMigration`, `pushOperations(context, request): Promise<PushResponse>`, service-role-only `private.apply_sync_push(owner, device, operations)`, and a public `security_invoker` RPC wrapper executable only by `service_role`.

- [ ] **Step 1: Write failing push tests**

Test device registration without hardware identifiers, unknown/revoked device `403`, migration dry-run without writes, atomic operation claiming, identical replay, mismatched request hash `422`, in-flight duplicate `409`, deterministic record ordering, owner stripping, 100-operation cap, revision conflict, one focus completion, and transaction rollback after a mid-batch error.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/pushService.test.ts && npm run test:database`

Expected: FAIL because the service/function does not exist.

- [ ] **Step 3: Implement database function and service**

Create the migration with the CLI. Keep privileged functions in `private`, empty `search_path`, revoke `PUBLIC/anon/authenticated`, and grant only `service_role`. Expose only a `security_invoker` RPC wrapper with the same revoked grants so PostgREST can invoke the private function using the Edge service credential. Every SQL predicate includes the verified owner passed by server code.

- [ ] **Step 4: Wire `POST /sync/push`**

Compose CORS → auth → body cap → schema parse → rate limit → register/validate/push service → safe response. The entry module contains no business rules.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/pushService.test.ts && npm run test:database && npm run test:security`

Expected: PASS.

Commit: `feat: add idempotent sync push gateway`

### Task 12: Implement cursor-safe incremental pull

**Files:**
- Create: `supabase/migrations/<cli-generated>_sync_pull_function.sql`
- Create: `supabase/functions/_shared/pullService.ts`
- Create: `supabase/functions/_shared/pullService.test.ts`
- Modify: `supabase/functions/sync/index.ts`

**Interfaces:**
- Consumes: verified principal, device id, opaque cursor, limit.
- Produces: `pullChanges(context, request): Promise<PullResponse>`, service-role-only `private.pull_sync_changes(owner, device, after, limit)`, and a service-role-only public invoker wrapper.

- [ ] **Step 1: Write failing pull tests**

Test owner-only results, `(change_sequence, record_id)` ordering, maximum page size, opaque malformed cursor rejection, tombstone inclusion, stable empty-page cursor, `410 CURSOR_EXPIRED` below the retention floor, revoked device, and no information leak when another owner's record id is guessed.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/pullService.test.ts`

Expected: FAIL because pull is absent.

- [ ] **Step 3: Implement pull and GET routing**

Return only validated envelopes. Do not expose raw SQL errors, sequence internals beyond the opaque cursor, or total account record counts.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/pullService.test.ts && npm run test:database && npm run test:security`

Expected: PASS.

Commit: `feat: add incremental sync pull gateway`

### Task 13: Build the authenticated gateway client and retry engine

**Files:**
- Create: `src/sync/gatewayClient.ts`
- Create: `src/sync/gatewayClient.test.ts`
- Create: `src/sync/syncEngine.ts`
- Create: `src/sync/syncEngine.test.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `LocalRepository`, `PushRequest/Response`, `PullRequest/Response`.
- Produces: `SyncGateway.registerDevice/validateMigration/push/pull`, `SyncEngine.start/stop/syncNow`, and observable `SyncState`.

- [ ] **Step 1: Write failing client tests**

Assert bearer token use without persistence, one refresh attempt on `401`, exact handling for `403/409/413/422/429/5xx`, `Retry-After`, timeouts, abort, response-schema validation, and generic UI-safe errors.

- [ ] **Step 2: Write failing engine crash/retry tests**

Assert local-first queueing, exponential jittered backoff, offline pause, no spin, ack only after durable commit, replay of a pulled page when records committed but cursor acknowledgement was interrupted, and safe full reconciliation after `CURSOR_EXPIRED` only after pending operations are pushed.

- [ ] **Step 3: Confirm failure**

Run: `npx vitest run src/sync/gatewayClient.test.ts src/sync/syncEngine.test.ts`

Expected: FAIL because client and engine do not exist.

- [ ] **Step 4: Implement client and engine**

Inject clock/random/fetch for deterministic tests. Never start sync for `guest`, `loading`, or `locked` identity.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/sync/gatewayClient.test.ts src/sync/syncEngine.test.ts && npm run typecheck`

Expected: PASS.

Commit: `feat: add durable sync client engine`

### Task 14: Ship the task vertical slice and visible sync state

**Files:**
- Create: `src/sync/SyncStatus.tsx`
- Create: `tests/sync/task-convergence.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/e2e.spec.ts`

**Interfaces:**
- Consumes: `SyncEngine`, workspace commit, task record adapter.
- Produces: working local-first task create/toggle/delete sync path and accessible status labels `Saved on this device`, `Syncing`, `Synced`, `Offline`, `Needs attention`.

- [ ] **Step 1: Write failing two-device task convergence test**

Simulate two repositories against an in-memory gateway: desktop creates offline, phone toggles after pull, desktop reconnects, retries, and both converge with one task and monotonic revision.

- [ ] **Step 2: Add failing browser tests**

Test task save while gateway is offline, status transitions, retry after reconnect, and sign-out with a pending operation offering sync or recovery export instead of purging data.

- [ ] **Step 3: Confirm failure**

Run: `npm run test:sync && npx playwright test tests/e2e.spec.ts --project=desktop --grep "sync|sign-out"`

Expected: FAIL before App uses the repository/engine.

- [ ] **Step 4: Wire the task slice and sync status**

Keep the existing `commit` UX; enqueue operations in the same local transaction and trigger background sync afterward.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:sync && npm run typecheck && npm run build && npx playwright test tests/e2e.spec.ts --project=desktop --grep "sync|sign-out"`

Expected: PASS.

Commit: `feat: synchronize tasks across browser devices`

### Task 15: Expand collections and preserve conflicts

**Files:**
- Create: `src/sync/conflicts.ts`
- Create: `src/sync/conflicts.test.ts`
- Modify: `src/sync/recordAdapter.ts`
- Modify: `src/sync/syncEngine.ts`
- Create: `tests/sync/all-collections-convergence.test.ts`

**Interfaces:**
- Consumes: local base records, remote revisions, changed-field lists.
- Produces: `resolveConflict(base, local, remote): MergeResult` and complete current-collection convergence.

- [ ] **Step 1: Write failing conflict tests**

Cover disjoint auto-merge, same-field recovery conflict, notebook sibling copy, stale update after tombstone, explicit newer restore conflict, per-key settings, date-keyed logs, and duplicate activity/focus prevention.

- [ ] **Step 2: Write failing all-collection convergence test**

Use two simulated devices and every collection from the complete schema-1 fixture; apply offline edits in opposite reconnect orders and assert equal validated final states plus preserved conflict copies.

- [ ] **Step 3: Confirm failure**

Run: `npx vitest run src/sync/conflicts.test.ts tests/sync/all-collections-convergence.test.ts`

Expected: FAIL because full conflict resolution is absent.

- [ ] **Step 4: Implement merge and collection expansion**

Never use client time to bypass revision checks. Quarantine invalid remote records without replacing the current validated state.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:sync && npm run test:unit && npm run typecheck`

Expected: PASS.

Commit: `feat: synchronize Tend records without silent loss`

### Task 16: Implement previewed, recoverable guest migration

**Files:**
- Create: `src/auth/guestMigration.ts`
- Create: `src/auth/guestMigration.test.ts`
- Create: `src/auth/GuestMigrationDialog.tsx`
- Modify: `src/App.tsx`
- Create: `tests/sync/guest-migration.test.ts`

**Interfaces:**
- Consumes: validated guest `AppState`, signed-in empty/existing workspace, repository recovery APIs, gateway dry-run/push/pull.
- Produces: `previewGuestMigration`, `runGuestMigration`, `resumeGuestMigration`, and UI states for preview/cancel/progress/complete/recover.

- [ ] **Step 1: Write failing migration tests**

Assert counts by collection, device-only exclusions, cancel leaves guest unchanged, one stable migration/operation id across retries, dry-run before apply, existing-account conflict handling, post-pull count/hash verification, and 30-day recovery retention.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run src/auth/guestMigration.test.ts tests/sync/guest-migration.test.ts`

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Implement migration logic and dialog**

Do not switch the active workspace until account state is verified. Never delete the original guest workspace as an implicit success step.

- [ ] **Step 4: Add and run the browser journey**

Run: `npm run build && npx playwright test tests/e2e.spec.ts --project=desktop --grep "guest migration"`

Expected: preview, cancel, retry, completion, and recovery pass.

- [ ] **Step 5: Commit**

Commit: `feat: migrate guest journals with recovery`

### Task 17: Add device controls and authenticated export

**Files:**
- Create: `supabase/functions/_shared/accountService.ts`
- Create: `supabase/functions/_shared/accountService.test.ts`
- Create: `supabase/functions/account/index.ts`
- Create: `src/auth/AccountPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: verified and recently reverified Clerk principal, device table, limiter, record adapter.
- Produces: list/revoke device endpoints using Task 11 registration, versioned streaming export, and account UI.

- [ ] **Step 1: Write failing account-service tests**

Test random UUID registration, no hardware identifiers, owner-only device list, immediate revoked-device denial, recent re-verification requirement, export field allowlist, no credentials/audit secrets, size cap, and exact operation rate limits.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/accountService.test.ts`

Expected: FAIL because account service does not exist.

- [ ] **Step 3: Implement service, routes, and UI**

Reverification failure returns `403` with a stable code; the UI invokes Clerk's documented reverification flow and retries once after success.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/accountService.test.ts && npm run test:database && npm run typecheck && npm run build`

Expected: PASS.

Commit: `feat: add Tend device and export controls`

### Task 18: Make account deletion resumable and webhook-backed

**Files:**
- Create: `supabase/functions/_shared/deletionService.ts`
- Create: `supabase/functions/_shared/deletionService.test.ts`
- Create: `supabase/functions/clerk-webhook/index.ts`
- Modify: `supabase/functions/account/index.ts`
- Modify: `src/auth/AccountPanel.tsx`

**Interfaces:**
- Consumes: recent re-verification, Clerk Backend API, verified Clerk webhook, owner-scoped delete functions.
- Produces: idempotent `requestAccountDeletion`, `resumeAccountDeletion`, and `handleClerkUserDeleted`.

- [ ] **Step 1: Write failing deletion and webhook tests**

Test explicit confirmation, re-verification, owner-only bounded deletion, retry after failure between database cleanup and Clerk deletion, repeated requests, valid signature/timestamp, invalid/replayed webhook denial, and webhook cleanup after partial deletion.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/deletionService.test.ts`

Expected: FAIL because deletion orchestration does not exist.

- [ ] **Step 3: Implement orchestration and signed webhook adapter**

Use `verifyWebhook(request, { signingSecret })`. Record the deletion intent before the external Clerk call; no transaction remains open during that call.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/deletionService.test.ts && npm run test:database && npm run test:security`

Expected: PASS, including the interrupted-deletion review-focus case.

Commit: `feat: add resumable Tend account deletion`

### Task 19: Enforce data-retention deletion paths

**Files:**
- Create: `supabase/migrations/<cli-generated>_retention_cleanup.sql`
- Create: `supabase/functions/_shared/retentionService.ts`
- Create: `supabase/functions/_shared/retentionService.test.ts`
- Create: `supabase/functions/retention/index.ts`

**Interfaces:**
- Consumes: tombstone/idempotency/conflict/security-event expiry columns and a scheduler-held secret.
- Produces: `purgeExpiredData(now): Promise<RetentionSummary>` and a scheduled, non-public cleanup entry point.

- [ ] **Step 1: Write failing retention tests**

Test exact 30-day tombstone/idempotency cutoffs, 90-day conflict/security-event cutoffs, retention-floor advancement before tombstone purge, expired-cursor detection, patch-against-purged-record rejection, unresolved conflict protection before expiry, owner-data independence, bounded batches, repeated-run idempotency, and denial without the scheduler secret.

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run supabase/functions/_shared/retentionService.test.ts && npm run test:database`

Expected: FAIL because cleanup is absent.

- [ ] **Step 3: Implement cleanup migration and service**

Create the migration using the CLI. Keep cleanup functions private and service-role-only, delete in bounded batches, and emit counts without record content.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run supabase/functions/_shared/retentionService.test.ts && npm run test:database && npm run test:security`

Expected: PASS.

Commit: `feat: enforce Tend cloud data retention`

### Task 20: Prove Clerk flows and cross-account isolation end to end

**Files:**
- Create: `tests/auth/clerk.spec.ts`
- Create: `tests/auth/global.setup.ts`
- Create: `tests/auth/rls-isolation.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Clerk test keys/testing token, a linked Supabase development project, deployed development functions.
- Produces: credential-backed evidence for sign-in/out, session isolation, User A/User B denial, and provider integration.

- [ ] **Step 1: Configure isolated Clerk test setup**

Use `clerkSetup()`, `setupClerkTestingToken()`, test-only keys, and separate storage state per user. Production keys must cause the test setup to refuse to run.

- [ ] **Step 2: Add auth and isolation journeys**

Cover email/password sign-in, configured Google sign-in availability, sign-out, expired token recovery, account switch cache isolation, direct Data API mutation denial, guessed record/cursor denial, and separate per-account exports.

- [ ] **Step 3: Run credential-backed tests**

Run: `npm run test:auth`

Expected: PASS when documented development credentials and endpoints exist. If they do not, the command exits with a precise prerequisites message and is reported as pending; it must not silently skip.

- [ ] **Step 4: Commit**

Commit: `test: verify Clerk and Supabase account isolation`

### Task 21: Harden static delivery and secret verification

**Files:**
- Modify: `index.html`
- Modify: `vite.config.ts`
- Create: `scripts/verify-security.mjs`
- Create: `scripts/verify-security.test.mjs`

**Interfaces:**
- Consumes: built SPA assets, configured public origins, Clerk/Supabase public endpoints, service-worker output.
- Produces: restrictive browser policy and `test:security` evidence for CSP, headers, caching, and secret absence.

- [ ] **Step 1: Add failing security-policy tests**

Inspect built HTML/assets for secrets, require a CSP that permits only the exact Tend/Clerk/Supabase/challenge sources, verify Edge security headers and exact-origin CORS, reject wildcard credentials, and prove the service worker never caches Clerk, Supabase, gateway, or authenticated API responses.

- [ ] **Step 2: Confirm failure**

Run: `npm run build && npm run test:security`

Expected: FAIL before policies and the verifier exist.

- [ ] **Step 3: Implement and verify delivery policies**

Use a CSP meta policy for the static SPA and make the verifier require documented host-level HSTS, frame, MIME, referrer, and permissions headers. Edge responses set their applicable headers directly.

Run: `npm run build && npm run test:security`

Expected: PASS with no secret-shaped value in generated output.

- [ ] **Step 4: Commit**

Commit: `security: harden Tend sync delivery`

### Task 22: Document operations and run the complete release gate

**Files:**
- Create: `docs/DATABASE.md`
- Create: `docs/SYNC_PROTOCOL.md`
- Create: `docs/SECURITY.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/RELEASE_CHECKLIST.md`

**Interfaces:**
- Consumes: all implemented modules and evidence commands.
- Produces: reproducible provider/deployment instructions, threat/control documentation, and final verification record.

- [ ] **Step 1: Write operational documentation**

Document environment purposes, Clerk claim/setup, Supabase third-party auth, migration/rollback, RLS, Redis, deployment, retention, deletion limitations, credential-backed tests, Android exclusion, and incident/key-rotation steps. Include commands, never values.

- [ ] **Step 2: Run the complete local gate**

Run:

```bash
npm ci --ignore-scripts
npm audit --audit-level=high
npm run typecheck
npm run test:unit
npm run test:database
npm run test:sync
npm run test:security
npm run build
npm run test:e2e
npm run verify:assets
cd android && ./gradlew testDebugUnitTest assembleDebug lintDebug
```

Expected: all local gates pass; existing offline journeys and Android baseline remain green.

- [ ] **Step 3: Run credential-backed provider gates**

Run: `npm run backend:reset && npm run backend:check && npm run test:auth`

Expected: clean migration, Supabase advisors without unresolved security/performance findings, Clerk doctor clean, auth/RLS E2E pass. If credentials or container runtime remain unavailable, record the exact blocked command and do not claim this gate passed.

- [ ] **Step 4: Commit**

Commit: `docs: complete secure sync release evidence`

## Final verification checklist

- [ ] Every local and credential-backed command has fresh output attached to the implementation record.
- [ ] Two-device tests converge in both reconnect orders.
- [ ] User A cannot read, mutate, infer, export, conflict with, or delete User B data.
- [ ] Device-id rotation does not bypass limits.
- [ ] Guest migration cancel/failure never changes guest data.
- [ ] Notebook conflicts and unsynchronized sign-out remain recoverable.
- [ ] Tokens and server secrets are absent from Git history additions, logs, browser storage, backups, build output, and Android assets.
- [ ] Direct browser mutations are denied and all supported writes use the gateway.
- [ ] Clerk and Supabase use the native third-party-auth integration, not the deprecated shared-secret JWT template.
- [ ] Supabase advisors and npm audit findings are resolved or explicitly blocked with owner and review date.
- [ ] Android remains offline and its existing tests/builds pass.
- [ ] Documentation distinguishes locally verified, credential-backed verified, and still-unverified behavior.

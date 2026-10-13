# Tend Secure Accounts and Offline Sync Design

**Date:** 13 October 2026

**Status:** Proposed for implementation; awaiting written-spec review

**Scope:** Tend 2.0 Phase 3a — desktop/web accounts, secure cloud storage, and offline synchronization

**Depends on:** [Repository recovery baseline](./2026-10-12-tend-repository-recovery-design.md)

## Intent

Add optional Clerk accounts and Supabase-backed synchronization to the recovered Tend application without making an internet connection a prerequisite, replacing the current interface, or risking the existing schema-1 journal.

The first delivery targets the React/Vite desktop-web application. Android remains on its current offline SQLite path until the browser implementation, database isolation, and synchronization protocol have passed multi-device and adversarial tests. The Android follow-up will reuse the protocol but add native secure credential storage and background-work constraints.

Success means a guest can continue using Tend offline, a signed-in user can safely synchronize supported data between two browser devices, one account cannot read or change another account's records, repeated or reordered requests do not duplicate data, and concurrent changes remain recoverable.

## Approved capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `identity` | Clerk sign-up/sign-in, Google login, sessions, sign-out, and account boundaries | — |
| `secure-data` | Supabase schema, least-privilege grants, per-user RLS, migrations, and retention | `identity` |
| `security-gateway` | Edge Function authentication, validation, rate limits, idempotency, and audit events | `identity`, `secure-data` |
| `sync-engine` | Local operation queue, batch push/pull, revisions, tombstones, retries, and conflicts | `secure-data`, `security-gateway` |
| `guest-migration` | Preview, confirmed import, recovery snapshot, and duplicate protection | `sync-engine` |
| `account-controls` | Device list/revocation, export, re-verification, and complete account deletion | `identity`, `sync-engine` |

Build order: `identity` → `secure-data` → `security-gateway` → `sync-engine` → `guest-migration` → `account-controls`.

These are implementation boundaries, not user-facing microservices. Tend remains one product and the server side remains a modular Supabase Edge Functions application backed by one PostgreSQL database.

## Scope

### In scope

- Guest mode that remains fully usable offline.
- Clerk email/password and Google sign-in for the React/Vite application.
- The current native Clerk-to-Supabase third-party-auth integration using asymmetric session tokens.
- Supabase PostgreSQL persistence for every currently implemented, shareable Tend record:
  - tasks;
  - routine blocks;
  - activities and completed focus sessions;
  - notebook entries;
  - daily reviews;
  - workout sets;
  - wake and sleep logs;
  - shareable settings.
- Account-scoped local storage and a durable operation queue.
- Incremental push/pull synchronization with bounded batches and cursors.
- Idempotent writes, record revisions, deletion tombstones, and conservative conflict handling.
- Guest-data migration with preview, explicit confirmation, rollback data, and retry safety.
- Registered-device metadata, device revocation, data export, and account deletion.
- Row-level security, least-privilege grants, validation, shared rate limiting, audit events, secure headers, CORS, secret management, and abuse tests.
- Automated unit, database, integration, browser, and two-device convergence tests.
- Documentation and environment templates without credentials.

### Out of scope

- Android sign-in or Android cloud synchronization in this delivery.
- Tauri/native desktop credential storage or background agents.
- Organizations, shared workspaces, administrator roles, team permissions, or billing.
- Supabase Auth as a second login system.
- Realtime/WebSocket synchronization; correct incremental polling takes priority.
- End-to-end encryption or a claim that browser origin storage is OS-protected.
- Future product records that are not yet implemented, including roadmaps, courses, projects, and job applications.
- Synchronizing Android accessibility events, restricted-package observations, parental PINs, credentials, notification permissions, or other device-only state.

## Approaches considered

### 1. Clerk + controlled Supabase sync gateway — selected

Clerk owns identity. Supabase trusts Clerk session JWTs through the native third-party-auth integration. The browser sends bounded sync requests to Supabase Edge Functions. The gateway verifies identity, validates the request, applies shared rate limits, claims idempotency keys, and invokes narrowly scoped database operations. PostgreSQL stores account-scoped records and enforces RLS on every exposed table.

This is the smallest architecture that provides a server-controlled mutation boundary, repeatable offline synchronization, and database-enforced tenant isolation.

### 2. Direct browser writes through the Supabase Data API — rejected

Direct writes can be protected with RLS, but they let clients bypass Tend's validation, batching, application rate limits, idempotency contract, conflict policy, and audit behavior. RLS prevents cross-account access; it does not make arbitrary client writes a safe synchronization protocol.

### 3. Dedicated Node.js API in front of Supabase PostgreSQL — deferred

A separate Node service would provide equivalent control but add deployment, connection pooling, availability, and monitoring work before Tend needs it. The protocol is deliberately transport-neutral so a dedicated service can replace the Edge Function gateway later without changing local operation semantics.

## Trust boundaries and threat model

### Assets

- Behavioral, career, notebook, routine, sleep, workout, and focus data.
- Clerk sessions and account recovery paths.
- Supabase service credentials, Clerk backend credentials, webhook secrets, and rate-limit credentials.
- Data integrity across offline edits, retries, account switches, and deletion.
- Audit evidence for security-sensitive actions.

### Boundaries

1. Browser UI → local repository: user-controlled form and imported-backup data.
2. Browser → Clerk: credentials and authentication flows.
3. Browser → sync gateway: untrusted JWT, headers, device id, cursor, operation ids, and record payloads.
4. Gateway → Clerk/Supabase/Redis: trusted services returning data that still requires shape and error validation.
5. Gateway → PostgreSQL privileged mutation path: the highest-risk boundary because server credentials can bypass ordinary RLS.
6. Clerk webhook → Tend webhook handler: untrusted until its signature and timestamp are verified.
7. Guest workspace → account workspace: a cross-principal migration boundary.

### STRIDE controls

| Threat | Primary controls |
|---|---|
| Spoofing | Clerk-signed short-lived tokens, issuer/audience validation, webhook signature verification, re-verification for sensitive actions |
| Tampering | HTTPS, schema validation, immutable operation ids, request hashes, atomic database functions, revision checks |
| Repudiation | Redacted security audit events for sign-in boundary changes, migration, export, device revocation, and deletion |
| Information disclosure | Per-owner RLS, explicit grants, exact-origin CORS, generic errors, no secrets or journal content in logs |
| Denial of service | Shared Redis rate limits, request and batch caps, timeouts, cursor pagination, body limits, bounded retries |
| Elevation of privilege | Owner id derived only from the verified token, no client roles, no user-editable metadata for authorization, deny-by-default grants, cross-account tests |

## Identity architecture

### Provider

- Use the current `@clerk/react` SDK for the Vite SPA.
- `ClerkProvider` sits at the application root.
- Auth-dependent UI checks `isLoaded` before using `isSignedIn`, `userId`, or `getToken`.
- Clerk supports email/password and Google sign-in. Tend does not store passwords.
- Supabase's native Clerk third-party-auth integration is configured with the Clerk instance domain.
- Do not use the deprecated Supabase JWT-template integration or share the Supabase JWT secret with Clerk.

### Sessions

- Clerk owns browser session cookies and token refresh.
- Tend requests short-lived session tokens through Clerk's SDK only when calling the gateway.
- Tokens, refresh credentials, Clerk secret keys, and Supabase secret/service keys never enter `AppState`, IndexedDB, localStorage, source control, logs, analytics, or exported backups.
- Guest mode does not create a hidden anonymous cloud identity.
- Signed-in account caches are keyed by Clerk user id. A cache is never loaded for a different signed-in user.
- Signing out removes the active account cache after pending operations are synchronized or safely exported. Tend never silently discards an unsynchronized queue.
- If a signed-in session expires while offline, the account cache is locked until Clerk can re-establish the same identity. Guest mode remains available separately.

### Clerk security settings

Production setup enables:

- suspicious-signup challenges;
- user-enumeration protection;
- breached-password and password-strength checks;
- sign-in notifications;
- bounded inactivity and maximum session lifetimes;
- protected email links;
- MFA and device trust when supported by the chosen production plan.

Device revocation, export, and deletion require recent Clerk re-verification. Multi-session account switching is not enabled in the first release; one active Tend account per browser profile avoids accidental cross-account cache display.

## Local storage architecture

The existing schema-1 `AppState` remains the UI's immediate data model. Cloud adoption must not rewrite a user's journal in place merely to add synchronization.

IndexedDB advances to a new local database version with these stores:

| Store | Purpose |
|---|---|
| `workspaces` | Validated schema-1 snapshots keyed by `guest` or Clerk user id |
| `syncOperations` | Durable, ordered, account-scoped operations waiting for acknowledgement |
| `syncMetadata` | Device id, per-record server revisions, last pull cursor, last successful sync, migration state |
| `syncBase` | Last acknowledged record state used for field-level conflict comparison |
| `recoverySnapshots` | Time-limited guest migration and destructive-action recovery snapshots |

A user action commits its validated snapshot and corresponding operations in one IndexedDB transaction. The interface updates only after that local transaction commits. Network work happens later and cannot make a local save fail.

If IndexedDB is unavailable, Tend preserves the existing local fallback for guest use but disables cloud synchronization with a clear explanation because snapshot and operation-queue durability cannot be guaranteed atomically.

## Cloud data model

The synchronization protocol stores a uniform envelope around validated Tend records. PostgreSQL is not a dump of the aggregate client snapshot.

### `user_records`

- `owner_id text not null` — Clerk token subject; never accepted from a client payload.
- `record_id uuid not null` — client-generated stable UUID.
- `collection text not null` — allowlisted current Tend collection.
- `schema_version integer not null` — record payload version.
- `payload jsonb` — null only for retained tombstones.
- `revision bigint not null` — increments for every accepted mutation.
- `change_sequence bigint not null` — monotonic server cursor value assigned on insert, update, and delete.
- `modified_at timestamptz not null` — authoritative server acceptance time.
- `modified_by_device uuid not null`.
- `deleted_at timestamptz`.
- Primary key: `(owner_id, record_id)`.
- Indexes: `(owner_id, change_sequence)`, `(owner_id, collection, deleted_at)`, and every ownership/foreign-key lookup used by RLS or deletion.

The collection allowlist is initially `task`, `routine_block`, `activity`, `notebook_entry`, `review`, `workout_set`, `wake_log`, `sleep_log`, and `setting`. Device-private settings are filtered before an operation is created and rejected again by the gateway.

### `devices`

Stores owner id, device UUID, user-visible name, broad platform, app version, creation time, last-seen time, and revocation time. It contains no hardware identifier, credential, accessibility event, installed-app inventory, or advertising identifier.

### `sync_operations`

Stores owner id, operation id, request hash, processing state, compact response, creation time, and expiry. `(owner_id, operation_id)` is unique and atomically claims an operation. Reusing an id with a different hash returns a validation error. In-flight duplicates return `409` with a retry instruction; completed duplicates replay the stored result.

### `sync_conflicts`

Stores account-scoped conflict metadata and the minimum record versions needed for recovery. Conflict rows are never visible to another owner and are deleted after resolution or the retention window.

### `security_events`

Stores event code, pseudonymous account reference, device id when relevant, success/failure, request id, and timestamp. It never stores record content, note text, tokens, passwords, raw authorization headers, or long-lived raw IP addresses.

### Database rules

- Use lowercase identifiers, `timestamptz`, UUIDs for distributed record identifiers, and explicit check constraints.
- Index every foreign key and every ownership/cursor predicate.
- Keep transactions short and perform external calls outside database transactions.
- New public-schema tables are not assumed to be exposed automatically; grants are explicit.
- Schema changes live in generated Supabase migrations and are verified against a clean local database.

## Authorization and RLS

Clerk user ids are text values. Policies compare `owner_id` with `(select auth.jwt()->>'sub')`; they do not cast the subject to UUID and do not rely on `auth.uid()`.

For each exposed account table:

- enable and force RLS;
- grant only the operations the published contract requires;
- deny `anon` access;
- require `TO authenticated` plus an ownership predicate;
- use `USING` and `WITH CHECK` for updates;
- prevent owner reassignment;
- use `security_invoker` for accessible views;
- place genuinely privileged helpers in a non-exposed schema, set an empty search path, and revoke default `PUBLIC` execution.

The browser receives only Clerk and Supabase publishable keys. The service role exists only in Edge Function secrets.

### Controlled mutation boundary

Browser roles receive no direct insert, update, or delete grants on synchronization tables. Mutations go through the gateway. The gateway verifies the Clerk token, derives `owner_id` from its subject, strips any owner supplied by the request, validates a fixed operation allowlist, and calls narrowly scoped mutation functions with server credentials.

Because server credentials bypass ordinary RLS, the privileged mutation layer is treated as a separate authorization boundary:

- no arbitrary table names, filters, columns, or SQL fragments;
- every statement includes the verified owner id;
- functions accept typed batches only;
- cross-owner ids are rejected before mutation;
- database constraints and transaction tests repeat those guarantees;
- the service key is never used for browser reads or returned data outside the verified owner scope.

Authenticated direct reads may be granted only where RLS and product need justify them. The supported client uses the gateway for both push and pull so validation, rate limits, audit behavior, and pagination remain consistent.

## Sync protocol

### Operation envelope

Each local mutation creates a stable envelope:

```ts
interface SyncOperation {
  operationId: string;
  deviceId: string;
  recordId: string;
  collection: TendCollection;
  kind: 'create' | 'patch' | 'delete';
  baseRevision: number | null;
  changedFields: string[];
  payload: unknown;
  clientModifiedAt: string;
  schemaVersion: 1;
}
```

`operationId` is generated once for the user intent and reused for every retry. It is never regenerated by retry code. The gateway hashes the canonical request before atomically claiming the id.

### Push

`POST /functions/v1/sync/push`

- Requires a valid Clerk bearer token and registered, non-revoked device.
- Accepts at most 100 operations and a bounded request body.
- Validates the envelope and collection-specific payload schema.
- Applies operations in deterministic record-id order inside a short transaction.
- Returns one stable result per operation: `applied`, `replayed`, `conflict`, or `rejected`.
- Advances no local acknowledgement until the response is durably stored.

### Pull

`GET /functions/v1/sync/pull?cursor=<opaque>&limit=<bounded>`

- Requires the same identity and device checks.
- Uses cursor pagination ordered by `(change_sequence, record_id)`.
- Returns only records belonging to the verified owner.
- Includes tombstones and a new opaque cursor.
- A cursor advances locally only after the pulled records and metadata commit in one local transaction.

### Bootstrap

The first account load pulls bounded pages from cursor zero. The app continues to render local data, shows an honest synchronization state, and never presents partial remote data as fully synchronized.

### Retry behavior

- Exponential backoff with jitter and an upper bound.
- Pause on offline status, revoked device, authentication failure, or explicit `Retry-After`.
- `401` requests one Clerk token refresh, then locks account sync if identity cannot be re-established.
- `403` stops retrying and surfaces device/account authorization state.
- `409` follows the conflict or in-flight-idempotency contract.
- `422` quarantines the invalid local operation and preserves a recovery copy.
- `429` waits for `Retry-After` and never spins.
- `5xx` retains the queue and retries later.

## Conflict rules

No supported conflict path silently discards user content.

- **Create:** `(owner_id, record_id)` and the operation id make retries idempotent. A different create for an existing id is a conflict.
- **Disjoint patch:** if local and remote changed different fields from the same known base, merge automatically and create the next revision.
- **Same-field patch:** keep the server version active, store the local alternative in `sync_conflicts`, and show a recoverable conflict action.
- **Notebook body/title:** concurrent body or title changes never use last-write-wins. Preserve a sibling conflict copy with source-device and time labels.
- **Append-only activity/focus completion:** stable session and operation ids prevent duplicate completion. A completed session cannot be completed again under a new payload without an explicit conflict.
- **Settings:** synchronize only allowlisted shareable keys and merge per key. Device-only keys never enter an operation.
- **Delete:** accepted deletes create tombstones. An older offline update cannot resurrect a tombstone. A genuinely newer divergent edit becomes a recovery conflict requiring explicit restore.

Server time orders accepted changes; client time is informational and cannot override a revision check.

## Guest migration

1. Keep the original guest workspace untouched.
2. Validate the complete guest snapshot using the existing parser.
3. Produce a preview with counts by collection, excluded device-only fields, and any invalid or conflicting records.
4. Require explicit confirmation in the UI.
5. Create a time-limited local recovery snapshot.
6. Assign one stable migration id and transform the snapshot into bounded operations.
7. Dry-run the server validation before applying any batch.
8. Upload idempotently; retries reuse the migration and operation ids.
9. Pull the resulting account state and compare counts/hashes before declaring completion.
10. Keep the guest recovery snapshot for 30 days or until the user explicitly removes it.

If the account already has data, migration merges by record UUID and applies the normal conflict rules. It never replaces the cloud account with the guest aggregate snapshot.

## Devices, export, and deletion

### Device controls

- A new browser installation registers a random device UUID after sign-in.
- Users can see device name, platform, creation, and last-seen time.
- Revocation immediately rejects future push/pull calls for that device.
- Revocation does not claim to erase data from a physically inaccessible browser; this limitation is disclosed.

### Export

- Recent re-verification is required.
- Export is produced on demand in a versioned Tend format and is not retained as a public object.
- The exported body contains account records and documented metadata, not tokens, audit secrets, raw IP data, or device credentials.
- Rate limits and size caps apply.

### Account deletion

- Recent re-verification and an explicit destructive confirmation are required.
- The operation is idempotent and records a deletion request before external calls.
- Tend data, unresolved conflicts, devices, operation results, and account-linked metadata are deleted by owner in a controlled transaction or bounded resumable batches.
- Clerk user deletion occurs through the Clerk Backend API after Tend data deletion has been accepted. A signed Clerk user-deleted webhook is an idempotent cleanup backstop.
- Rate-limit entries expire automatically. Security events retain no reversible journal content.
- Provider backup retention and its deletion delay are documented honestly in the privacy notice.

## Gateway validation and errors

All external data is parsed at the boundary using explicit schemas. Unknown fields are rejected. Limits cover total body bytes, operations per batch, payload depth, arrays, strings, note length, cursor length, identifiers, and dates.

Every error uses one safe shape:

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryAfterSeconds?: number;
    fieldErrors?: Record<string, string[]>;
  };
}
```

HTTP semantics:

- `400` malformed envelope or cursor;
- `401` missing, invalid, or expired authentication;
- `403` authenticated but revoked or unauthorized;
- `409` revision conflict or operation still in progress;
- `413` request too large;
- `422` valid JSON that violates the domain schema or reuses an idempotency key with another payload;
- `429` rate limited with `Retry-After`;
- `500` generic server failure with no stack trace or provider detail.

Logs use request ids and event codes. They redact authorization headers, cookies, tokens, passwords, full IP addresses, note text, journal payloads, and environment values.

## Rate limiting and abuse resistance

Rate limits use a shared serverless Redis-compatible store so separate Edge Function instances enforce one policy. The official Supabase Upstash pattern is the initial deployment choice. Unavailability fails closed for destructive operations and uses a narrowly bounded degraded policy for ordinary sync, with an operational alert.

Initial limits are configurable and versioned:

| Operation | Account/device limit | Additional control |
|---|---:|---|
| Pull | 120/minute | cursor and page-size cap |
| Push | 30/minute | 100 operations and body-size cap |
| Guest migration | 3/hour | one active migration per account |
| Export | 5/hour | recent re-verification and size cap |
| Device revocation | 10/hour | recent re-verification |
| Account deletion | 3/hour | recent re-verification and idempotency |

Each request is limited across account and IP dimensions; device limits add fairness but are never the only control because a client can generate new device ids. Clerk independently applies its authentication endpoint limits and configured bot/credential protections.

Responses expose `Retry-After`, and the client backs off. No in-memory-only counter is considered a production limiter.

## Headers, CORS, and transport

- HTTPS only outside local development.
- Exact allowlist for production, preview, and explicitly configured local origins.
- Never use wildcard CORS with credentials.
- CSP starts deny-by-default and explicitly permits only Tend, Clerk, Supabase, and the configured challenge assets required by Clerk.
- Apply HSTS in production, `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, a restrictive `Permissions-Policy`, and frame protections compatible with Clerk's documented flows.
- Preflight responses are bounded and do not disclose internal configuration.
- Android receives no Internet permission in this delivery.

## Secrets and configuration

Committed `.env.example` files contain names and placeholders only.

Browser-exposed configuration:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only configuration includes Clerk backend/webhook credentials, Supabase secret/service credentials, and Redis REST credentials. Server-only values are stored in provider secret stores, never Vite variables.

Dependencies are pinned to reviewed compatible versions, the lockfile is committed, install scripts are reviewed before execution, and native package-manager audit/signature checks run before release. No forced audit remediation is allowed.

## Privacy and retention

| Data | Classification | Purpose | Retention |
|---|---|---|---|
| Tend records | Sensitive personal data | User-requested storage and synchronization | Until deletion; tombstones up to 30 days |
| Conflict copies | Sensitive personal data | Recover concurrent edits | Until resolved or 90 days |
| Device metadata | PII-adjacent | Device visibility and revocation | Until device/account deletion |
| Idempotency results | Operational metadata | Safe retry behavior | 30 days |
| Security events | Security metadata | Abuse investigation | 90 days unless law requires otherwise |
| Rate-limit keys | Ephemeral metadata | Abuse prevention | Limit window plus short buffer |
| Guest recovery snapshot | Sensitive local data | Migration rollback | 30 days or explicit removal |

No analytics or third-party telemetry receives journal content. The privacy notice discloses Clerk, Supabase, and the rate-limit provider as processors, their purposes, configured regions, and provider-backup deletion behavior.

## Components and project structure

The implementation extracts synchronization from the current large application shell without unrelated redesign:

```text
src/
  auth/                 Clerk provider, auth state, account controls
  data/                 local repository and schema-1 record adapter
  sync/                 operation model, queue, client, merge, conflicts
  security/             environment parsing and client-safe constraints
  App.tsx               existing experience wired to the new boundaries
supabase/
  config.toml           local project configuration
  functions/
    sync/               push/pull/bootstrap gateway
    account/            devices, export, and deletion gateway
    clerk-webhook/      signed lifecycle cleanup handler
    _shared/            auth, validation, errors, CORS, rate limits, logging
  migrations/           generated, reviewed database migrations
tests/
  sync/                 protocol and convergence tests
  e2e/                  existing plus account/migration/offline journeys
docs/
  DATABASE.md
  SYNC_PROTOCOL.md
  SECURITY.md
```

Public module contracts are defined before implementations. `App.tsx` consumes an account/session boundary and a repository boundary; it does not construct Supabase queries or parse JWTs.

### Code style example

```ts
export interface SyncGateway {
  push(input: PushRequest, signal?: AbortSignal): Promise<PushResponse>;
  pull(input: PullRequest, signal?: AbortSignal): Promise<PullResponse>;
}

export type PushResult =
  | { status: 'applied'; operationId: string; revision: number }
  | { status: 'replayed'; operationId: string; revision: number }
  | { status: 'conflict'; operationId: string; conflictId: string }
  | { status: 'rejected'; operationId: string; code: string };
```

Use explicit names, discriminated unions, dependency injection at provider boundaries, immutable client-state updates, and one shared error contract. Boundary schemas are the only place untrusted values become trusted domain types.

## Commands

Current commands remain valid throughout implementation:

```bash
npm ci --ignore-scripts
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
npm run verify:assets
npm audit --audit-level=high
```

The implementation adds stable project scripts so contributors do not need to remember changing provider CLI syntax:

```bash
npm run backend:start
npm run backend:stop
npm run backend:reset
npm run backend:check
npm run test:database
npm run test:sync
npm run test:auth
npm run test:security
```

The underlying Supabase CLI commands will be selected from the installed CLI's `--help` output and pinned in the lockfile; they are not guessed in this design.

## Testing strategy

### Unit

- Environment validation and secret/public variable separation.
- Aggregate-to-record conversion and device-only field filtering.
- Stable operation ids and canonical request hashing.
- Queue ordering, retry/backoff, cancellation, and `Retry-After` handling.
- Disjoint-field merge, same-field conflict, notebook conflict copies, tombstone behavior, and cursor advancement.
- Guest migration preview and transformation.

### Database and RLS

- Clean migration apply and rollback/rebuild path.
- `anon` receives no account data.
- User A cannot select, insert, update, delete, infer, or conflict with user B records.
- Update policies enforce both old-row ownership and new-row ownership.
- Owner id cannot be reassigned.
- Revoked devices cannot mutate or pull.
- Service mutation functions cannot operate on a different verified owner.
- Index/advisor checks report no unresolved security or performance finding.

### Gateway integration

- Invalid, expired, wrong-issuer, and wrong-audience tokens fail.
- Oversized, deeply nested, unknown-field, invalid-collection, and malformed-cursor requests fail safely.
- Duplicate operation with the same hash replays; another hash fails.
- Concurrent identical operations apply once.
- Rate limits are shared across function instances and return `Retry-After`.
- CORS accepts only configured origins.
- Errors and logs contain no token or record content.
- Clerk webhook signatures, timestamps, replays, and wrong secrets are tested.

### Browser and two-device journeys

- Guest mode remains usable without keys or network.
- Sign-up/sign-in/sign-out and Google-provider configuration are exercised with Clerk test credentials.
- Each auth test uses isolated browser state and Clerk's testing token.
- Guest migration preview, cancel, retry, completion, and recovery work.
- Two simulated devices edit offline, reconnect in both orders, and converge.
- Concurrent notebook edits preserve both bodies.
- Repeated focus-session completion creates one activity.
- Account switching never shows the other account's cache.
- Sign-out with pending changes cannot discard them silently.
- Device revocation, export, deletion, and post-deletion denial work end to end.

### Security and release gates

- Native dependency audit has no unmitigated reachable critical/high issue.
- Secret scan covers the worktree, staged diff, built assets, source maps, and generated Android web assets.
- CSP and other headers are verified in a real browser.
- Supabase database/security advisors are clean or every deferral has an owner and review date.
- Production builds contain publishable keys only.
- Existing 40 unit tests, browser journeys, asset checks, and Android offline baseline remain green.

Production Clerk/Supabase/Redis credentials, provider dashboards, and email/Google OAuth configuration remain environment validation, not fixtures committed to Git.

## Implementation boundaries

### Always

- Preserve guest mode and the schema-1 backup contract.
- Write tests before each protocol, authorization, or migration behavior.
- Use current official Clerk and Supabase documentation.
- Pin dependencies and commit the lockfile.
- Derive account ownership from a verified token, never a request body.
- Run RLS isolation and two-device convergence tests before declaring a slice complete.
- Keep the repository runnable and locally usable after each implementation slice.

### Ask before changing the approved design

- Add another identity, database, cache, analytics, or hosting provider.
- Synchronize a new category of personal or device data.
- Weaken RLS, CORS, CSP, rate limits, session rules, validation, retention, or deletion behavior.
- Enable Android networking or store Android credentials.
- Replace the Edge Function gateway with a dedicated server.

The selected Clerk, Supabase, and shared Redis rate-limit integrations are approved by this design. Creating their development projects and local configuration occurs only after the implementation plan is approved.

### Never

- Commit or print secrets, production data, user backups, or signing material.
- Put auth tokens in localStorage or Tend backups.
- Expose service/secret keys to Vite or the browser.
- Use user-editable Clerk metadata for authorization.
- Trust `TO authenticated` without an ownership predicate.
- add `SECURITY DEFINER` merely to bypass a permission error.
- silently overwrite guest, offline, conflicting, or unsynchronized data.
- claim Android sync, production deployment, or physical-device behavior is complete without evidence.

## Delivery slices

The later implementation plan must preserve vertical, reviewable slices:

1. Identity shell with guest fallback and account-scoped local workspaces.
2. Local Supabase schema plus adversarial RLS tests.
3. Authenticated, rate-limited gateway with idempotent single-record push/pull.
4. Durable queue and two-device synchronization for tasks.
5. Remaining current collections and conflict recovery.
6. Guest migration and rollback.
7. Device controls, export, deletion, and Clerk webhook cleanup.
8. Security verification, documentation, and production handoff.

Each slice includes unit, integration, and browser evidence and leaves guest mode working.

## Success criteria

1. Tend launches and remains fully useful as a guest without network access or provider keys.
2. A user can sign in with Clerk email/password and configured Google OAuth without Tend handling passwords.
3. Existing guest data is previewed and copied only after confirmation; cancellation and failure leave it unchanged.
4. Two signed-in browser devices can edit offline, reconnect, and converge without duplicate focus sessions or lost notebook content.
5. Every cloud record is account-scoped; automated tests prove User A cannot access User B by changing ids, cursors, payloads, operations, or direct API calls.
6. Direct browser writes to synchronization tables are denied; supported mutations pass through the authenticated gateway.
7. RLS is enabled and forced where applicable, policies contain ownership predicates, grants are explicit, and database advisors have no unresolved security finding.
8. Operation retries are idempotent, mismatched request hashes fail, tombstones prevent resurrection, and invalid operations remain recoverable.
9. Shared rate limits work across concurrent gateway instances and return correct retry guidance.
10. Tokens and secret keys are absent from localStorage, Tend state, backups, logs, built artifacts, source control, and Android assets.
11. Device revocation, export, and account deletion require recent re-verification and pass end-to-end tests.
12. Existing offline behavior, backups, browser journeys, and the Android offline baseline remain green.
13. Documentation explains local setup, provider setup, schema, sync protocol, security controls, privacy/retention, deployment, and known platform limitations.

## Open questions

None blocking. Provider project identifiers, secrets, production domains, OAuth redirect domains, deployment region, and final privacy/legal text are deployment inputs supplied outside source control. Implementation will use local/development projects and documented placeholders until those inputs exist.

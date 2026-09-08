# Equipment Ledger API

Backend-first implementation of the Wyxan full-stack assessment. The API uses an immutable movement ledger for audit/history and an atomically maintained asset projection for fast current-state reads.

## Architecture

- **NestJS + TypeScript** exposes REST endpoints and owns all business validation.
- **MongoDB replica set** enables multi-document transactions.
- **Movements are append-only.** A correction is a new movement referencing the fact it supersedes.
- **Assets are serialization points.** Every issue, return, correction, reservation, or service-status mutation writes the asset document in its transaction. Concurrent operations for the same asset therefore conflict/retry instead of both succeeding.
- **Current state is a projection, not historical authority.** `currentHolderId` makes list screens efficient, while `GET /api/ledger/as-of` replays movements by effective time.
- **Two clocks are preserved.** `effectiveAt` is when something happened and `recordedAt` is when it was entered.
- Time windows are half-open: `[startAt, endAt)`. Adjacent reservations are valid.

### Why both a ledger and a projection?

Computing every dashboard row from all historical movements is unnecessarily expensive. Storing only current rows, however, cannot answer historical questions or preserve corrections. The transaction updates both together, and `npm run check:invariants` verifies the projection against the authoritative ledger.

## Run locally

Prerequisites: Node.js 22+, npm, and Docker Desktop.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run seed
npm run check:invariants
npm run start:dev
```

API base URL: `http://localhost:3001/api`.

Start the frontend in a second terminal:

```bash
npm run web:dev
```

The equipment console is available at `http://localhost:3000`. It includes the live asset register, issue/return and service-status actions, reservation creation and register, complete movement history with corrections, and historical as-of reconstruction. Copy `web/.env.example` to `web/.env.local` only when the API URL differs from the local default.

The Mongo connection includes `replicaSet=rs0`; do not replace it with a standalone Mongo instance because transactions are part of the correctness strategy.

## Commands

```bash
npm run build
npm test
npm run test:e2e
npm run seed
npm run check:invariants
npm run start:dev
npm run web:build
npm run web:dev
```

The seed is deterministic and repeatable. It resets the configured ledger database, then creates 60 assets, 12 workers, certifications (valid, expired, and expiring), 30 days of history, outstanding and overdue issues, a late-recorded return, an auditable correction, an out-of-service asset, and past/future/missed reservations. Do not point the seed command at a database containing data you intend to retain.

`npm run test:e2e` uses the local replica set but an isolated `equipment-ledger-test` database. It resets only that test database and verifies HTTP validation, a 20-request issue race, concurrent idempotent replay, concurrent reservation overlap, adjacent reservations, certification refusal, returns, impossible backdating rollback, corrections, exact-instant reconstruction, and out-of-service policy.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/assets` | List/search current assets |
| `GET` | `/api/assets/:id` | Current asset details |
| `GET` | `/api/assets/:id/history` | Recorded audit history |
| `POST` | `/api/assets/:id/issue` | Transactional issue |
| `POST` | `/api/assets/:id/return` | Return or return-as-damaged |
| `POST` | `/api/assets/:id/corrections` | Append a time correction |
| `PATCH` | `/api/assets/:id/out-of-service` | Mark unavailable and cancel future reservations |
| `PATCH` | `/api/assets/:id/back-in-service` | Restore availability |
| `GET` | `/api/workers` | List workers/certifications |
| `GET` | `/api/reservations` | List reservations |
| `POST` | `/api/reservations` | Create a non-overlapping reservation |
| `PATCH` | `/api/reservations/:id/cancel` | Cancel an active reservation with an audit reason |
| `GET` | `/api/ledger/as-of?at=...` | Reconstruct every asset at an instant |

All write requests require a UUID `idempotencyKey`. A retry must reuse the same key.

Example issue body:

```json
{
  "workerId": "WORKER_OBJECT_ID",
  "recordedById": "KEEPER_OBJECT_ID",
  "effectiveAt": "2026-09-08T09:00:00.000Z",
  "dueAt": "2026-09-08T17:00:00.000Z",
  "idempotencyKey": "3f47f566-c9c3-4c60-a9fa-753946634d31",
  "note": "Issued at store hatch"
}
```

## Invariants and concurrency

### Concurrent issue

Issue conditionally updates an asset whose `currentHolderId` is null, service status is `IN_SERVICE`, and ledger version is unchanged. Exactly one competing transaction can commit that state change. The movement is inserted in the same transaction. A browser button being disabled is only a convenience and is not relied upon for correctness.

### Reservation overlap

MongoDB has no exclusion constraint for time ranges. Reservation creation first mutates the asset serialization document inside a transaction, then checks:

```text
existing.startAt < proposed.endAt AND existing.endAt > proposed.startAt
```

Only after that check does it insert. Concurrent attempts against the same asset conflict at the asset write and are retried by MongoDB against current data.

### Backdated events and corrections

Before a proposed movement or correction commits, all effective movements for that asset are replayed in deterministic order (`effectiveAt`, `recordedAt`, `_id`). The request is rejected if it produces a second holder, a return without an issue, a mismatched returning worker, or an issue while out of service. At an exact issue timestamp the issue is effective; at an exact return timestamp the asset is back in store.

### Certification

The worker's matching certification must expire strictly after the issue instant. A certification expiring at or before the issue instant is rejected. This explicit timestamp rule avoids server-timezone ambiguity.

## Deliberate domain decisions

- Returning as anyone other than the recorded holder is rejected.
- A true idempotent retry returns the original result; a new second return is rejected.
- An issued asset must be returned before a normal out-of-service action.
- An issue records a required due time; current overdue state is derived from that timestamp rather than stored as a mutable flag.
- An active reservation protects its time window for its worker and is fulfilled in the same transaction as pickup.
- Expired active reservations are reconciled to `MISSED`; active reservations can be cancelled with keeper, time, and reason retained.
- `damaged: true` on return atomically returns and takes the asset out of service.
- Taking an available asset out of service cancels future active reservations and records the reason.
- Past reservations and reservations longer than 30 days are rejected.
- Historical reconstruction before an asset's creation omits it; between creation and its first movement it is in service and unheld.
- Authentication, permissions, email, uploads, barcode scanning, multi-site support, and a mobile app are deliberately excluded by the brief.

## Production hardening / another day

- Add transaction-failpoint and browser end-to-end tests in addition to the existing HTTP concurrency suite.
- Add pagination and compound cursor indexes for large histories.
- Add OpenAPI documentation and structured request tracing.
- Introduce an explicit asset-created ledger event if asset identity itself must become fully event-sourced.
- Add a scheduled background transition from active reservations to missed; reads currently reconcile expired records.
- Add correction support beyond `effectiveAt` while preserving the same append-only pattern.

## Known scope

The repository contains the NestJS API, MongoDB replica-set setup, deterministic seed and invariant checker, automated unit/HTTP concurrency tests, Postman collection, and responsive Next.js interface. Authentication, permissions, notifications, uploads, barcode scanning, multi-site support, and a mobile application are intentionally excluded by the assessment brief. The short demonstration recording is delivered separately because it is a submission artifact rather than source code.

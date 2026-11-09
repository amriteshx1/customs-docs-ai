# Customs Desk

Internal workspace for a freight documentation team. A documentation executive creates a shipment, uploads a commercial invoice, packing list, and bill of lading, and a vision model extracts structured fields. Deterministic checks compare the three documents. People confirm or correct values, a documentation manager approves the current revision, and only then can the shipment be exported as CSV.

The product does not file entries with a customs portal, classify HSN codes, calculate duty, or talk to unnamed filing software. The CSV is an internal handoff defined by this app (`export_schema_v1`).

## What works today

The core slice is the full review loop on real files:

1. Sign in as executive or manager.
2. Create a shipment (executive).
3. Upload the three documents (PDF, JPEG, PNG, or WebP, up to 20 MB each).
4. Run extraction. The model may return present, missing, or unreadable fields. A file the model cannot read is stored as unreadable, not as a successful extraction.
5. Review fields beside the source document. Confirm, correct, or enter values by hand. Low-confidence present values must be confirmed.
6. Resolve mismatches by correcting values. Mismatches cannot be waived. Warnings do not block export.
7. Submit for approval (executive). Approve (manager).
8. Download CSV. The server re-checks eligibility; a disabled button is not the control.
9. Any later edit, replace, or re-extraction increments the content revision and revokes approval. Export is blocked until the new revision is submitted and approved again.
10. Managers can open Accuracy: confirmed and corrected AI fields versus the original extraction.

There is no public sign-up, no organisation or invitation UI, and no seed of users or sample shipments in the repository. Accounts exist only in the database you point the app at.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16.4.5 App Router, React 19.3, TypeScript |
| UI | Tailwind CSS 4, Radix primitives, shadcn-style components, Inter, dark theme |
| Auth | Better Auth, email and password, Prisma adapter, `disableSignUp: true` |
| Database | PostgreSQL, Prisma ORM 7 (`prisma-client` generated to `src/generated/prisma`) |
| Files | S3-compatible object storage. Local default is MinIO. The app creates the bucket if it is missing. |
| Extraction | OpenAI Responses API, default model `gpt-4o`, `store: false`, file sent inline as base64 |
| Validation | Pure TypeScript in `src/server/validation/engine.ts`. Does not call the model. |
| PDF preview | pdf.js, worker at `/pdf.worker.min.mjs`, bytes loaded from an authenticated same-origin route |

Pages are dynamic (`cacheComponents: false`) because every screen is session-driven. Upload body limits are 25 MB at the Next.js proxy so a 20 MB file can actually arrive. Extraction continues after the HTTP response with Next.js `after()` on the Node server. There is no Redis, queue, or worker process. A restart can leave a document in `PROCESSING`; the executive retries.

Browser code never receives MinIO credentials or the OpenAI key. Document preview uses `GET /api/shipments/:id/documents/:documentId/file` with `cache-control: private, no-store`.

## Roles

Single internal tenant. Every signed-in user can see every shipment. Role cannot be chosen from the client (`input: false` on Better Auth). Default role is `DOCUMENTATION_EXECUTIVE`. Assign manager in the database after the user exists.

| | Documentation executive | Documentation manager |
| --- | --- | --- |
| Sign in | Yes | Yes |
| Create shipment, upload, replace, extract | Yes | No |
| Edit, confirm, manual entry, submit | Yes | No |
| Approve | No | Yes |
| Accuracy page | No | Yes |
| Download CSV when the server says eligible | Yes | Yes |

## Main screens

- **Sign in.** Email and password. Copy states that accounts are issued; public registration is closed.
- **Shipments.** Table of shipment ID, supplier, dates, processing status, review status, open issues. Executives get New shipment.
- **New shipment.** Shipment ID, supplier, supplier country, optional importer.
- **Shipment workspace.** Compact header (ID, supplier, processing, review, blockers, Download CSV). Three document cards. Run extraction. Two columns: extracted fields / checks / activity on the left, document preview on the right. Fields start collapsed. The preview stays put while the field list scrolls.
- **Accuracy.** Overall figure, by field, by supplier. Manager only.

Loading, empty, and error states exist on the app shell and shipment pages. The layout is desktop-oriented. It is usable on a narrow window but is not a dedicated mobile design.

## Extraction

`ExtractionProvider` is the only model call site (`src/server/extraction/openai.ts`). Swap vendors there without touching validation or the UI.

Each field is one of:

- `present`, with a value and a confidence score from 0 to 1
- `missing`, with no value and no confidence
- `unreadable`, with no value and no confidence

The provider does not use the OpenAI Files API. Keep `store: false`. Do not opt the provider account into training. Invalid JSON, schema failures, timeouts, and missing keys mark the document `FAILED` (retryable), not success. Whole-document unreadable stores no present values and is `UNREADABLE`. Unreadable fields on an otherwise readable file make the document `PARTIAL`. Those fields are entered by hand. Missing fields stay empty instead of being guessed.

Low confidence means below `EXTRACTION_CONFIDENCE_THRESHOLD` (default 0.85), or a present value with no score. Those fields must be confirmed or corrected before export.

## Cross-checks

Checks compare only values that are actually present. One source produces a warning, not a mismatch. Units are never converted. `kg`, `kgs`, and `kilogram` are the same unit. `g` versus `kg`, or `lb` versus `kg`, stays in review.

- Invoice line total against quantity times unit price, within 0.01 after half-up rounding to cents
- Invoice total against the sum of line totals, same currency
- Package counts, exact whole numbers
- Gross and net weight: mismatch when the gap is greater than the larger of 0.5 or 0.1 percent of the larger absolute value
- Supplier and exporter names after case, punctuation, and company-suffix cleanup
- Container numbers after removing spaces and hyphens

Results are `PASS`, `WARNING`, `MISMATCH`, or `NEEDS_REVIEW`. A mismatch cannot be waived. Correct a value so the check returns `PASS`. Warnings do not block export.

## Export gate

`POST /api/shipments/:id/export` is the only download path. It re-runs eligibility and returns 409 with `{ error, reasons }` until all of the following are true:

1. The caller is signed in (either role).
2. All three documents are `EXTRACTED` or `MANUALLY_COMPLETED`.
3. No open issue is a mismatch or needs review.
4. Required invoice fields and one complete line are present and confirmed, and an importer or consignee is present.
5. A manager has approved the current `contentRevision` (`approval.contentRevision` must match).

`contentRevision` starts at 1 and increments on replace, extraction start, field correction, confirmation, and manual entry. An existing approval is set to `REVOKED`. The executive must submit the new revision; the manager must approve again.

CSV is one row per invoice line, header columns repeated. Commercial fields come from the invoice. Parties and containers prefer the bill of lading. Weights and packages prefer the packing list. A single non-contradictory source is used when the other documents omit the field.

Columns: `export_schema_version`, `shipment_id`, `supplier_name`, `supplier_country`, `importer_name`, `exporter_name`, `consignee_name`, `notify_party`, `invoice_number`, `invoice_date`, `currency`, `incoterm`, `invoice_total`, `line_number`, `description`, `hsn_code`, `quantity`, `quantity_unit`, `unit_price`, `line_total`, `package_count`, `package_type`, `gross_weight`, `gross_weight_unit`, `net_weight`, `net_weight_unit`, `container_numbers`.

## Accuracy

A field counts only after a person confirms or corrects an AI value that was present. Denominator: `source = AI`, `presence = PRESENT`, review state `CONFIRMED` or `EDITED`, original value stored. Numerator: canonical original equals canonical current. Unchanged confirmations count as correct. Missing, unreadable, and manually entered fields are excluded. Grouped by field key with line index stripped (`lineItems.*.quantity`) and by supplier.

## Data model (summary)

Prisma schema: `prisma/schema.prisma`. Migration: `prisma/migrations/20261109135926_init`.

- Better Auth: `user` (with `role`), `session`, `account`, `verification`
- `Shipment` (`shipmentCode` unique, `contentRevision`, `submittedRevision`, processing and review status)
- `Document` (one current file per type per shipment)
- `DocumentExtraction`, `ExtractedField` (immutable original JSON plus current JSON), `FieldEdit`
- `ValidationIssue` (latest run replaced)
- `Approval` (one per shipment), `ExportRecord`, `ActivityEvent`

Processing: `AWAITING_DOCUMENTS`, `READY`, `PROCESSING`, `FAILED`, `MANUAL_ENTRY_REQUIRED`, `COMPLETE`. Review: `NOT_READY`, `IN_REVIEW`, `PENDING_APPROVAL`, `APPROVED`. Complete means every document is `EXTRACTED` or `MANUALLY_COMPLETED`. Unreadable and partial documents are not complete.

## Repository layout

```
prisma/                 schema and initial migration
src/app/                App Router pages and API routes
src/components/         header, shipment workspace, UI primitives
src/domain/             field catalogue, labels, status derivation, value normalisation
src/lib/                env, Prisma, Better Auth
src/server/             authz, storage, extraction, validation, export, accuracy
public/pdf.worker.min.mjs
```

Generated Prisma client lives in `src/generated/prisma` and is gitignored.

## Security

- `.env` is gitignored. `.env.example` has names and empty placeholders only.
- Sign-up is disabled. Role cannot be set from a client payload.
- Every mutating API checks session and role.
- Uploads are checked by MIME and magic bytes. Max size `MAX_UPLOAD_BYTES` (default 20 MB).
- Export eligibility is enforced on the server.
- Inputs for shipment create and field updates go through Zod schemas in `src/domain/schemas.ts`.

There is no automated test suite in this repository. Important rules live in `src/server/validation/engine.ts`, `src/server/export/eligibility.ts`, and `src/domain/values.ts`.

## Local setup

Requirements: Node.js 20 or newer, PostgreSQL, a running MinIO (or other S3-compatible) server, and an OpenAI API key for extraction.

1. Copy environment template and fill in values. Do not commit `.env`.

```bash
cp .env.example .env
```

2. Create the database `customs_docs` in PostgreSQL.

3. Start MinIO (example). Path-style addressing is required.

```bash
minio server --address ":9000" --console-address ":9001" ~/minio/data
```

4. Install, migrate, run.

```bash
npm install
npx prisma migrate dev
npm run dev
```

The app is at `http://localhost:3000`. The bucket named in `S3_BUCKET` is created on first upload if it does not exist.

Production-style run after `npx prisma migrate deploy`:

```bash
npm run build
npm start
```

## Environment variables

Names only. Put real values in `.env` or the host’s secret store, never in the repository.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Auth signing secret. Generate a long random string. |
| `BETTER_AUTH_URL` | Public origin of the app (`http://localhost:3000` locally) |
| `S3_ENDPOINT` | S3-compatible API URL (`http://127.0.0.1:9000` for local MinIO) |
| `S3_REGION` | Region string the SDK requires (MinIO accepts `us-east-1`) |
| `S3_BUCKET` | Bucket name (default in example: `customs-docs`) |
| `S3_ACCESS_KEY_ID` | Object storage access key |
| `S3_SECRET_ACCESS_KEY` | Object storage secret |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | Extraction provider key |
| `OPENAI_MODEL` | Default `gpt-4o` |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | Default `0.85` |
| `MAX_UPLOAD_BYTES` | Default `20971520` |

On a deployed host, set `BETTER_AUTH_URL` to the public HTTPS origin. Point `S3_*` at a bucket in the same region as the app and database. MinIO is only the local stand-in. The model request still leaves the hosting region.

## Accounts

The UI cannot register users. A fresh database has no logins until you create them.

Create users with Better Auth’s server API against the same database, then set roles in SQL. Suggested demo accounts used during local development:

| Email | Password | Role | Name |
| --- | --- | --- | --- |
| exec@customs.local | ExecDemo123! | DOCUMENTATION_EXECUTIVE | Asha Menon |
| manager@customs.local | ManagerDemo123! | DOCUMENTATION_MANAGER | Ravi Iyer |

After the executive user exists:

```sql
UPDATE "user" SET role = 'DOCUMENTATION_MANAGER' WHERE email = 'manager@customs.local';
```

These rows are not in git. Production and a new local database both need this step. Sign in on `/login` with those emails once the rows exist.

## Sample documents

The repository does not ship sample PDFs. Create a shipment in the UI and upload three files you control (invoice, packing list, bill of lading). Use obviously different figures on one shared field (for example gross weight) if you want to see a mismatch.

## What was cut

- Automated tests and CI
- Seed scripts and fixture PDFs in the repo
- Sign-up, invitations, organisations, and account administration UI
- Background worker / Redis queue
- Dedicated mobile layout
- HSN classification, duty calculation, and customs-portal filing

Next useful steps, if the product continued: a checked-in operator script to provision the two roles, tests around eligibility and the validation engine, and an India-region object store with a provider agreement the business accepts for sending documents to the model.

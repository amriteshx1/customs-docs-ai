# Customs desk

Internal workspace for a freight documentation team. An executive creates a shipment, uploads the commercial invoice, packing list, and bill of lading, and the app reads them with a vision model. Deterministic checks compare the documents. People correct and confirm the fields, a manager approves the revision, and only then can the shipment be exported as CSV.

This does not file entries with a customs portal, classify HSN codes, or calculate duty.

## Local setup

Requirements: Node.js 22 or newer, PostgreSQL, and a running MinIO server. The app talks to MinIO through the S3 API and creates the bucket if it is missing.

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Fill in `.env` before migrating. `S3_FORCE_PATH_STYLE=true` is required for MinIO. Do not commit `.env`.

Public registration is closed, and this build does not seed users or sample shipments. Create the first accounts against the same database with Better Auth’s server API, then set the role in Prisma. Suggested local accounts:

| Email | Password | Role |
| --- | --- | --- |
| exec@customs.local | ExecDemo123! | DOCUMENTATION_EXECUTIVE |
| manager@customs.local | ManagerDemo123! | DOCUMENTATION_MANAGER |

The role field is `input: false`, so a sign-up request cannot choose it. Assign the manager role with a database update after the account exists.

## What the model may return

Each field is one of:

- `present`, with a value and a confidence score from 0 to 1
- `missing`, with no value and no confidence score
- `unreadable`, with no value and no confidence score

A file the model cannot read is stored as unreadable and is not treated as a successful extraction. Those fields are entered by hand. Missing fields stay empty instead of being guessed.

The provider call sets `store: false` and sends the file inline. It does not use the OpenAI Files API. OpenAI API data is not used to train models unless the account explicitly opts in. Do not enable that option. Swap providers by replacing `ExtractionProvider`; validation and the review screen do not call the model.

Low confidence means below 0.85, or a present value with no score. Those fields must be confirmed before export.

## Cross-checks

Checks compare only values that are actually present. One source produces a warning, not a mismatch. Different units are never converted. `kg`, `kgs`, and `kilogram` are the same unit. `g` versus `kg`, or `lb` versus `kg`, stays in review.

- Invoice line total against quantity times unit price, within 0.01 after half-up rounding to cents
- Invoice total against the sum of line totals, same currency
- Package counts, exact whole numbers
- Gross weight and net weight, mismatch when the gap is greater than the larger of 0.5 or 0.1 percent
- Supplier and exporter names after case, punctuation, and company-suffix cleanup
- Container numbers after removing spaces and hyphens

Results are `PASS`, `WARNING`, `MISMATCH`, or `NEEDS_REVIEW`. A mismatch cannot be waived. Correct a value so the check passes. Warnings do not block export.

## When export is allowed

`POST /api/shipments/:id/export` is the only way to download the file. The button’s disabled state is not the control. Export returns 409 until all of the following are true:

1. The caller is signed in.
2. All three documents are `EXTRACTED` or `MANUALLY_COMPLETED`.
3. No open issue is a mismatch or needs review.
4. Required invoice fields and one complete line are present and confirmed, and an importer or consignee is present.
5. A manager has approved the current `contentRevision`.

Uploading a replacement, running extraction again, confirming a field, or correcting a field increments `contentRevision` and revokes approval. The next export is rejected until the executive submits the new revision and a manager approves it.

The CSV is `export_schema_v1`, one row per invoice line, with the header repeated. It is an internal handoff, not a claim of compatibility with unnamed filing software. Columns:

`export_schema_version`, `shipment_id`, `supplier_name`, `supplier_country`, `importer_name`, `exporter_name`, `consignee_name`, `notify_party`, `invoice_number`, `invoice_date`, `currency`, `incoterm`, `invoice_total`, `line_number`, `description`, `hsn_code`, `quantity`, `quantity_unit`, `unit_price`, `line_total`, `package_count`, `package_type`, `gross_weight`, `gross_weight_unit`, `net_weight`, `net_weight_unit`, `container_numbers`.

Commercial fields come from the invoice. Parties and containers prefer the bill of lading. Weights and packages prefer the packing list. A single non-contradictory source is used when the other documents omit the field.

## Accuracy

Confirmed and corrected AI values are stored with the original extraction untouched. Accuracy is correct reviewed fields divided by reviewed AI fields, grouped by field key (`lineItems.*.quantity`) and by supplier. Missing, unreadable, and manual-only values are excluded. Managers see this on the Accuracy page. It is not an analytics dashboard.

## Production note for hosting in India

Run the app and PostgreSQL in an India region, and point `S3_*` at an S3-compatible bucket in that same region. MinIO is only the local endpoint. Keep `store: false` and do not opt the provider account into training. The model request itself leaves the hosting region, so a production rollout needs a provider agreement the business accepts.

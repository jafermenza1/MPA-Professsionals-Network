# Membership migration and payment workflow

## Legacy membership import

The platform does **not** overwrite current membership data when an old register is imported.

The workflow is:

1. Upload CSV/XLSX/normalized JSON.
2. Preserve the original row in the import record.
3. Normalize names, email, phone, membership number, dates, product and payment fields.
4. Match against existing accounts using stable legacy member ID first, then membership number and controlled contact/name matching.
5. Produce candidates with confidence and reasons.
6. Automatically accept only a high-confidence unique match.
7. Send ambiguous matches to an authorized reviewer.
8. Create a new member/account only when no existing person is found and policy allows it.
9. Map the old membership product to the current configurable membership product through an explicit mapping.
10. Preserve the original membership dates/status and historical payment information.
11. Record a membership event and full import provenance.
12. Never silently convert an imported payment into a provider-confirmed online payment.

This allows an old membership register and future online registrations to converge on one member identity without destroying history.

### Important identity rule

Matching is not based on name alone. A name collision is a review case, not permission to merge two people.

### Incoming members

A new registration is matched against existing active/pending records before creating a new person. The same identity-resolution policy can therefore be reused for:

- legacy imports;
- new online registration;
- admin-created records;
- membership renewal;
- imported payment reconciliation.

## Payment workflow

Payment is provider-neutral.

Supported paths:

- online provider;
- bank transfer;
- cash;
- manual payment entry;
- imported historical payment.

All use the same transaction and reconciliation model.

### Manual payment

A member or authorized staff member can submit:

- amount;
- currency;
- payment purpose;
- reference number;
- payment channel;
- supporting receipt/document/photo.

The transaction starts as pending and **does not activate the membership solely because a receipt was uploaded**.

An authorized finance/reviewer role can:

- approve;
- reject;
- request correction;
- record verification notes;
- reconcile the payment to a membership.

Every decision is auditable.

### Online payment

The same payment record supports an online provider adapter. Provider callbacks/webhooks must be idempotent and must not be trusted solely from the browser.

### Historical payment

Legacy payments remain marked as `legacy_import`. They can support historical membership evidence and reconciliation but are never represented as a gateway-confirmed payment unless separately verified.

## Docker is optional

Docker is a deployment/development convenience, **not an application requirement**.

The application can run directly with Node.js and a PostgreSQL database:

    Node.js 20+
    PostgreSQL 15/16+
    npm test
    npm start

Docker Compose is provided for reproducible local setup and CI-like development. It is useful for:

- consistent PostgreSQL version;
- one-command local environment;
- isolated dependencies;
- easier onboarding;
- repeatable deployment packaging.

It is not required for:

- application code;
- tests that do not require PostgreSQL;
- production;
- managed PostgreSQL;
- VM/bare-metal deployment;
- Kubernetes/container platforms.

The only runtime dependency that remains mandatory is the configured database and other selected infrastructure services. Provider adapters keep storage, notification and payment implementations replaceable.

## Phase exit implication

Membership migration and manual payment verification are now part of the foundation contract and must be preserved when the membership module is implemented.
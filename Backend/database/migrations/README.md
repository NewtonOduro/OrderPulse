# Database migrations

The current application does not yet maintain a versioned migration ledger. Each database adapter creates missing tables with `CREATE TABLE IF NOT EXISTS` and applies the small compatibility column additions during startup. The feedback and staff-announcement tables follow this same idempotent startup pattern; they are not a separate migration runner. This is idempotent schema initialization, not a reversible migration history.

The adapter-specific initialization lives in:

- `../adapters/mysql-database.js` for the production MySQL-compatible database.
- `../adapters/postgres-database.js` for PostgreSQL and the in-memory PostgreSQL test adapter.

The adapters initialize `order_feedback`, `staff_announcements`, `staff_announcement_reads`, `delivery_areas`, `restaurant_deals`, and `customer_favorites` alongside the existing order and team tables. New checkout metadata columns are added idempotently to existing `orders` tables. PostgreSQL's order-type constraint is updated to allow delivery. Keep schema changes synchronized across both adapters and add API coverage for each change.

Put future versioned schema changes in this folder, make each change safe to apply once, and run it against both supported dialects before moving schema ownership out of the current adapters. Do not add a second schema source here until startup initialization has been migrated and covered by tests.

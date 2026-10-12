# Database migrations

The current application does not yet maintain a versioned migration ledger. Each database adapter creates missing tables with `CREATE TABLE IF NOT EXISTS` and applies the small compatibility column additions during startup. This is idempotent schema initialization, not a reversible migration history.

The adapter-specific initialization lives in:

- `../adapters/mysql-database.js` for the production MySQL-compatible database.
- `../adapters/postgres-database.js` for PostgreSQL and the in-memory PostgreSQL test adapter.

Put future versioned schema changes in this folder, make each change safe to apply once, and run it against both supported dialects before moving schema ownership out of the current adapters. Do not add a second schema source here until startup initialization has been migrated and covered by tests.

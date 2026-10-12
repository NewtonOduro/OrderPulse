# Backend architecture

The API is an ES-module Express application. `index.js` loads environment configuration, checks/creates the initial manager account, starts the server, and reports email-provider configuration. `routes/app.js` composes middleware, routes, static frontend hosting, and the final error handlers. Request logic is split into controller modules under `Controllers/`; routes remain responsible for URL, HTTP method, and middleware wiring.

## Folder responsibilities

| Folder | Responsibility |
| --- | --- |
| `Controllers/` | Admin, user, and write-operation request handlers. |
| `database/` | Database selection and the database package's internal folders. |
| `database/adapters/` | MySQL and PostgreSQL connections, query compatibility, transactions, and startup schema setup. |
| `database/migrations/` | Schema-change guidance and the location for future versioned migration files. The current schema is still initialized idempotently by each adapter at startup. |
| `database/models/` | Relational entity/table reference. The project uses parameterized SQL and does not have an ORM model class layer. |
| `database/seeds/` | Idempotent starter table/menu data and featured menu records. |
| `docs/` | Architecture and project-maintainer documentation. |
| `middleware/` | Authentication, authorization, cookie sessions, and staff activity auditing. |
| `repositories/` | Reserved for a future query/data-access extraction. SQL queries currently live in controllers. |
| `routes/` | Express application, route registration, middleware ordering, static files, and error handling. |
| `schemas/` | Menu category and placement rules shared by API validation. |
| `scripts/` | One-off manager setup and menu import utilities. |
| `services/` | Email tokens/delivery, account bootstrap, payment provider integration, and reservation availability. |
| `tests/` | API, database adapter, email notification, and manager bootstrap tests. |
| `utils/` | Reserved for shared stateless helpers when a real use case is extracted. |

## Request lifecycle

1. Express applies common response headers and JSON parsing. Webhook and resume-upload routes apply their special raw-body or size-limited parsers before the general parser.
2. Public routes apply endpoint-specific rate limits and validation.
3. Customer routes use session authentication and customer-role authorization. `/api/staff` requires an authenticated staff or manager account; `/api/manager` additionally requires the manager role. Staff/manager writes are audited.
4. Controllers call application services and the database adapter. SQL placeholders use `?` in application code; adapters translate them for the selected driver.
5. Responses are JSON except for the resume download and static frontend routes. Unhandled API errors reach the final error middleware.

See [project-guide.md](./project-guide.md) for the complete feature, API, data, environment, test, and deployment reference.

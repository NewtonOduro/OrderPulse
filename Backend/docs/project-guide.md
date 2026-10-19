# OrderPulse project guide

This guide describes the current implementation so developers, operators, and reviewers can find the source of truth for each part of the application.

## Product overview

OrderPulse is a restaurant ordering and operations application for a restaurant in Ahodwo, Kumasi. It combines a public restaurant site and ordering experience with customer accounts, reservations, staff operations, manager controls, Paystack checkout, and transactional email.

The customer interface is a React single-page application. The API is an Express ES-module application. MySQL 8-compatible storage is the production database; PostgreSQL is also supported for the automated in-memory API/database tests. Currency values are stored as integer pesewas and converted to Ghana cedis in API responses and the UI.

## Repository map

```text
.
├── Backend/
│   ├── Controllers/       # Request handlers grouped by admin, user, and writes
│   ├── database/
│   │   ├── adapters/      # MySQL and PostgreSQL drivers/schema startup
│   │   ├── migrations/    # Migration policy; schema is currently adapter-initialized
│   │   ├── models/        # SQL table/entity reference (no ORM)
│   │   └── seeds/         # Initial menu/table data
│   ├── docs/              # Architecture and project guide
│   ├── middleware/        # Sessions, role checks, activity auditing
│   ├── repositories/      # Future query extraction point
│   ├── routes/            # Express application and route wiring
│   ├── schemas/           # Menu category rules
│   ├── scripts/           # Manager creation and menu import
│   ├── services/          # Email, payment, booking, manager bootstrap
│   ├── tests/             # Node test-runner suites
│   ├── index.js           # API process entry point
│   ├── package.json
│   └── .env.example       # Names and examples only; no production secrets
├── frontend/
│   ├── src/               # React screens and client-side flows
│   ├── public/            # Static images and favicon
│   └── package.json
├── render.yaml            # Render web-service build/start and environment declarations
├── package.json           # Root development/build/test shortcuts
└── README.md              # Quick start and product summary
```

`Backend/docs/architecture.md` explains the boundaries between backend folders. Database schema initialization is currently idempotent code in each database adapter; there is not yet a migration-history table or reversible migration runner.

## Main user journeys

### Browse and place an order

1. The frontend loads menu data and popularity counts from `GET /api/menu`, plus current delivery areas, discount codes, priced meal bundles, and public table names from `GET /api/restaurant-options`.
2. The customer chooses individual dishes and/or priced bundles, pickup, dine-in, or delivery, and contact details. Delivery requires a configured active neighbourhood and address. QR links preselect dine-in and attach the table ID.
3. `POST /api/orders` validates the request, resolves current prices, bundle contents, delivery fees, discount codes, and reward eligibility on the server (never trusting client totals), checks availability and stock, and inserts the order and item snapshots in one transaction.
4. Tracked stock is decremented in that transaction, with row locks and conditional updates preventing concurrent overselling.
5. The API initializes Paystack checkout. The order starts in `awaiting_payment` / `pending`; kitchen preparation is blocked until payment is verified.
6. The browser returns to the app and calls `POST /api/payments/verify`. Paystack webhooks are independently signature-checked and verified server-to-server. Only a confirmed successful transaction marks the order paid.
7. The customer can track an order with its confirmation number and checkout phone number. Staff update paid orders through the kitchen/order workspace.

Managers configure delivery areas and flat fees, publish fixed-amount discount codes, and create fixed-price meal bundles with selected menu items and quantities from the staff dashboard. Bundles are bag line items charged at the configured bundle price; included ingredients consume inventory and appear on kitchen tickets. Optional active dates apply to both types of offer. Discount codes reduce the food subtotal, not delivery fees. An authenticated customer earns one point per GH₵1 spent on food in completed paid orders; 100 points can be reserved at checkout for up to GH₵5 off. Guests can sign up before checkout or claim paid guest orders later using the same verified email. Delivery fees do not earn points. The order retains its delivery, offer, bundle, table, and reward details for staff and receipt views.

Customers can favorite menu items, review recent orders, and add available items from a previous order back to the bag. Verified customer accounts can claim older paid orders that used the same account email. Table QR codes generated in the staff Tables workspace open the public menu with a table ID; the server validates that table before accepting a dine-in order.

After a paid order is completed, customers can leave one rating from one to five stars and an optional comment. Feedback remains a genuine customer-selected rating; the app does not force five-star reviews.

### Register and reserve

1. A customer registers with name, email, phone, and a password of at least 12 characters.
2. A single-use verification token is stored as a SHA-256 hash and emailed. Verification links expire after 24 hours. Password-reset links expire after 60 minutes.
3. Sign-in creates a server-side session record and sets a secure, HTTP-only cookie. The browser requests `GET /api/auth/me` to restore the session.
4. A signed-in customer checks table availability and creates a reservation. Reservation requests are linked to their account and are managed by restaurant staff.
5. Customers can view their profile, order and reservation history, rewards balance, saved dishes, and order feedback. Account deletion requires the current password; profile details, saved dishes, and feedback are removed, while retained order and reservation records are anonymized.

### Staff and manager operations

Staff can view operational summaries, tables, reservations, menu items, and paid order tickets. Staff can update table/reservation/order states and flag menu availability. Managers can additionally manage staff accounts, applications/resume downloads, menu edits, inventory, delivery areas, meal deals, and manager reports. Table QR codes are available on each table card.

Authenticated staff and manager mutations are recorded in `activity_logs` with actor, action, entity, details, and timestamp. Deactivating a staff member revokes that user's sessions.

### Career applications

The public careers form accepts PDF, DOC, or DOCX resumes up to 5 MB, validates file metadata/base64, stores the file in `job_applications`, and sends configured notifications. Managers can review the application metadata and download its resume.

## HTTP API reference

All API routes are under `/api`. JSON request bodies use the field names consumed by the matching frontend form. Errors are returned as JSON with an `error` message. Authentication uses the HTTP-only session cookie; never send a password, provider secret, or raw token in a URL or log.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Render health check. |
| `GET` | `/menu` | Public | List available menu items, prices, and categories. |
| `GET` | `/restaurant-options` | Public | Read current delivery areas, active discount codes and meal bundles, and table names. |
| `POST` | `/careers/applications` | Public, rate-limited | Submit career application and resume. |
| `POST` | `/auth/register` | Public, rate-limited | Create unverified customer account and send verification. |
| `POST` | `/auth/login` | Public, rate-limited | Create a session after password/email checks. |
| `POST` | `/auth/verify-email` | Public, rate-limited | Consume email-verification token. |
| `POST` | `/auth/resend-verification` | Public, rate-limited | Request a fresh verification message. |
| `POST` | `/auth/forgot-password` | Public, rate-limited | Request a password-reset email. |
| `POST` | `/auth/reset-password` | Public, rate-limited | Consume reset token and update password. |
| `GET` | `/auth/me` | Signed in | Return the current safe user profile. |
| `POST` | `/auth/logout` | Public/session-aware | Revoke session and clear its cookie. |
| `GET` | `/reservation-availability` | Public | Check tables for a date, time, and party size. |
| `POST` | `/bookings` | Customer | Create an account-linked reservation. |
| `GET` | `/customer/reservations` | Customer | List the signed-in customer's reservations. |
| `GET` | `/customer/engagement` | Customer | Read loyalty points, progress, and favorite count. |
| `GET`, `POST`, `DELETE` | `/customer/favorites` and `/customer/favorites/:menuItemId` | Customer | List, save, and remove favorite dishes. |
| `GET` | `/customer/orders` | Customer | List account orders with item IDs for reorder. |
| `POST` | `/orders` | Public, rate-limited | Validate order, reserve stock, create order, initialize checkout. |
| `POST` | `/order-tracking` | Public, rate-limited | Look up a customer's order using order number and phone. |
| `POST` | `/payments/verify` | Public, rate-limited | Verify a Paystack transaction server-side. |
| `POST` | `/paystack/webhook` | Paystack signature | Process verified Paystack charge events. |
| `GET` | `/manager/summary` | Manager | Read restaurant-wide counts and sales summary. |
| `GET` | `/manager/activities` | Manager | Read recent staff activity. |
| `GET`, `POST` | `/manager/staff` | Manager | List staff/manager accounts and create staff accounts. |
| `PATCH` | `/manager/staff/:id` | Manager | Activate/deactivate staff account. |
| `GET`, `POST`, `PATCH` | `/manager/delivery-areas` and `/manager/delivery-areas/:id` | Manager | Configure neighbourhoods, flat delivery fees, and availability. |
| `GET`, `POST`, `PATCH` | `/manager/deals` and `/manager/deals/:id` | Manager | Publish and activate/deactivate meal-deal codes. |
| `GET` | `/manager/applications` | Manager | List career applications. |
| `GET` | `/manager/applications/:id/resume` | Manager | Download a validated stored resume. |
| `GET` | `/staff/summary` | Staff/manager | Read operational summary. |
| `GET`, `POST` | `/staff/tables` | Staff/manager | List and add restaurant tables. |
| `PATCH` | `/staff/tables/:id` | Staff/manager | Update table state. |
| `GET`, `PATCH` | `/staff/reservations` and `/staff/reservations/:id` | Staff/manager | List and update reservations/table assignment. |
| `GET`, `POST`, `PUT`, `PATCH` | `/staff/menu` and `/staff/menu/:id...` | Staff/manager | Read menu; manager creates/edits items and stock; staff can flag availability. |
| `GET`, `PATCH` | `/staff/orders` and `/staff/orders/:id` | Staff/manager | List orders and update paid order preparation state. |

Unknown API paths return JSON 404. For exact validation and response shapes, the controller and route implementation plus `Backend/tests/api.test.js` are authoritative.

## Data model

The dialect adapters define the canonical tables and foreign keys:

- `users` owns customer, staff, and manager accounts.
- `sessions` and `email_auth_tokens` reference `users`; only hashed opaque tokens are stored.
- `menu_items` stores live prices in `price_pesewas`; `orders` stores its total in `total_pesewas`.
- `orders` snapshots the customer account, table, delivery address/area/fee, offer discount, and redeemed rewards for each checkout.
- `delivery_areas` stores enabled neighbourhoods and their configured delivery fees; `restaurant_deals` stores discount codes and optional active dates.
- `meal_bundles` and `meal_bundle_items` store manager-configured bundle prices and included item quantities; `order_meal_bundles` snapshots purchased bundle lines.
- `customer_favorites` links customer accounts to saved menu items. Loyalty balances are derived from completed paid orders and reward points reserved by non-cancelled orders.
- `order_items` references both `orders` and `menu_items`, while retaining item name and unit price snapshots from checkout.
- `bookings` can reference a customer account and an assigned `restaurant_tables` record.
- `activity_logs` optionally references a user and retains copied actor name/email for history.
- `job_applications` stores applicant fields plus resume filename/type/bytes and consent timestamp.

Schema creation and compatibility columns are currently applied idempotently at adapter startup. Seed data is inserted by `database/seeds/database-seed.js`; featured menu records are in `database/seeds/featured-menu.js`. The seeds avoid replacing menu data once menu records already exist, and tables are added only when none exist. Use `DB_SKIP_SEED=1` for MySQL or `PG_SKIP_SEED=1` for PostgreSQL when seed insertion must be skipped.

## Configuration

Copy `Backend/.env.example` to `Backend/.env` for local use. Do not commit `.env`, production credentials, database URLs, email/API keys, or resume data.

| Variable | Required/use |
| --- | --- |
| `PORT` | API listen port; defaults to `4000`. |
| `NODE_ENV` | Set to `production` on Render; enables production proxy handling. |
| `MYSQL_URL` | Production MySQL-compatible connection URL. Required by the default database adapter. |
| `MYSQL_SSL` | Set `true` to require TLS for MySQL. |
| `MYSQL_SSL_CA` | Optional private CA PEM for database TLS. |
| `DATABASE_POOL_SIZE` | Optional DB connection pool size; defaults to `5`. |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial manager bootstrap values. Use a strong password; remove `ADMIN_PASSWORD` after first manager creation. |
| `PAYSTACK_SECRET_KEY` | Paystack server key. Use test keys locally; production uses the live key. |
| `PUBLIC_APP_URL` | Public frontend origin used to construct auth/payment return links. |
| `BREVO_API_KEY`, `EMAIL_FROM` | Preferred transactional email provider and verified sender. |
| `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Optional Gmail API fallback. |
| `STAFF_NOTIFICATION_EMAIL`, `JOB_APPLICATION_NOTIFICATION_EMAIL` | Optional notification destinations. |
| `RESEND_API_KEY` | Optional alternative email-provider configuration. |

Render's `render.yaml` declares the service and environment-variable names. Secret values marked `sync: false` must be entered in the Render dashboard; the YAML intentionally contains no secret values. Render hosts the Node service, while MySQL must be supplied by an external database provider with required TLS settings.

## Local development

Requires Node.js 20 or newer.

```powershell
npm install
npm install --prefix Backend
npm install --prefix frontend
Copy-Item Backend\.env.example Backend\.env
npm run dev
```

Set a reachable MySQL-compatible URL and the provider/email/payment settings in `Backend/.env`. The root development command starts the API and Vite frontend together. Vite normally serves `http://localhost:5173`; the API defaults to `http://localhost:4000`.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start API and frontend in development. |
| `npm run build` | Build the frontend for production. |
| `npm test` | Run backend Node tests, using the in-memory PostgreSQL-compatible adapter. |
| `npm run create-manager` | Create a manager from `ADMIN_*` variables. |
| `npm run import-menu-data -- <sqlite-path>` | Import supported menu records from the supplied SQLite data file. |

Backend tests can also be run from `Backend/` with `npm test`. Tests isolate their in-memory database and stub Paystack/email network interactions.

## Deployment and operations

The Render service builds with `npm ci` for Backend and frontend, then Vite build, and starts with `npm start --prefix Backend`. `/api/health` is the configured health check. When the repository's configured production branch receives a push, Render can automatically deploy it if auto-deploy is enabled for the service; the successful Git push alone does not prove a deployment completed. Check the Render Events/Deploys page and service health after a push.

Before production use:

1. Configure external MySQL, TLS, and a least-privilege database account.
2. Set Render private environment values for database, Paystack, and Brevo (or a supported fallback); do not put credentials in source control.
3. Configure a verified Brevo sender and the correct `PUBLIC_APP_URL`.
4. Create the initial manager, remove the bootstrap password from the environment, and verify manager access.
5. Confirm Paystack test-mode end-to-end before changing to live credentials.
6. Run `npm test`, `npm run build`, check Render deploy logs, and verify `/api/health`.

## Security and data-handling notes

- Passwords use bcrypt hashes; sessions and email-action tokens are random values stored only as SHA-256 hashes.
- Session cookies are HTTP-only, and production cookie settings use secure transport.
- SQL values are passed through adapter placeholders rather than string concatenation.
- Order total and item prices are recomputed server-side. Stock decrement and order creation are transactional.
- Payment status is only changed after server-side Paystack verification; webhook signatures are checked.
- Career resumes are restricted by accepted extension/MIME pair and byte-size limit, then served only to a manager with download safety headers.
- Email verification links expire after 24 hours; reset tokens last one hour and are single-use.
- Review and rotate any credential that may ever have been committed, pasted into a public issue, or exposed in a deployment log.

## Known implementation boundaries

- Initial menu prices are estimates and should be reviewed in the manager menu workspace before real sales.
- The frontend is a Vite-built SPA served by the Express service in production.
- PostgreSQL exists primarily to support a fast in-memory test environment; production configuration uses MySQL.
- The migration directory documents the current startup-schema approach. A versioned, reversible migration runner and ORM model classes do not currently exist.
- Repository modules are an extension point; database statements are currently part of the request/controller layer.
- Feature behavior is covered by the backend test suites, but successful tests do not verify live external provider credentials, Render provisioning, or a production payment.

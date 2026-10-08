# OrderPulse

A Ghana-focused restaurant ordering and operations starter built with React, Tailwind CSS, Express, and SQLite. Prices are stored as integer pesewas and shown to guests in GH₵.

## Reference project comparison

The three reference repositories were reviewed and removed after their relevant feature ideas were incorporated into this original application.

| Reference | What it contributes | How it informed this app |
| --- | --- | --- |
| reshniVisionX | MERN-style project with table bookings, ordering, customer history, and admin dish/order/report screens; dependencies show both MongoDB and MySQL drivers. | Booking, order, and staff-management feature ideas. |
| Himanshu-25 | React menu/cart/checkout paired with an Express/MySQL backend. | Guest menu browsing and checkout flow. |
| codx-ak | React screens for menu, orders, and table bookings/layout; no separate Express server or database manifest. | Table and order workflow ideas. |

This app uses a single relational SQLite database for a zero-service local setup. The UI and API are original, and the food/restaurant photography uses licensed/source-provided and replacement assets rather than copying reference-project code.

## Project layout

- `Backend/` contains the Express API, server tests, and backend environment configuration.
- `frontend/` contains the React, Tailwind CSS, and Vite application.
- `database/` contains the SQLite database created and migrated by the API.
- The root `package.json` provides convenience commands to run, build, test, and initialize the manager account.

## Included workflows

- Guest menu browsing split into Local food, Foreign foods, and Drinks (including a separate wine subsection), plus a bag, pickup/dine-in order submission, and GH₵ totals.
- Guest account registration and sign-in, with reservations linked to the signed-in customer's account.
- Individual staff sign-ins, with a manager-only dashboard for team activity, staff accounts, restaurant summaries, reservations, tables, menu, orders, and kitchen operations.
- A persistent audit log records the authenticated staff member, action, affected area, and timestamp for successful operational changes.
- SQLite persistence for customer/staff accounts, sessions, activity, menu, orders, order items, bookings, and tables. The database schema is created or migrated when the API starts.
- Staff can optionally track per-dish stock counts and low-stock thresholds. Successful orders decrement tracked stock atomically; zero-stock dishes leave the guest menu and cannot be ordered. Blank stock quantities remain untracked, and staff can still manually mark a dish unavailable.
- Managers can create, edit, price, categorize, and move menu items between Local food, Foreign food, Starters, Soups and Salads, Main Courses, Side Dishes, Desserts, Sandwiches and Burgers, Pasta and Noodles, Kids Menu, and Drinks. Drinks can be arranged under Non-Alcoholic, Alcoholic, or Functional & Specialty beverage groups and the matching hot/cold, juice, beer, wine, spirits, cocktail, or zero-proof subcategories. Staff can view the menu and mark an item unavailable; menu edits and stock management are manager-only.
- Customers can look up an order using its confirmation number and checkout phone number. The tracker shows the kitchen status and refreshes automatically while the order is active.
- Menu records are seeded idempotently from the supplied food-photo references; unrelated pins (including the paella, rice-served Nigerian soup/jollof, hidden soda-can safe, and non-wine spirits) are omitted. The supplied Red Red photo is stored locally at `frontend/public/images/red-red.jpg`.

The added menu prices are starter estimates in Ghana cedis because no prices were supplied. Update them in the staff Menu workspace before taking real customer orders.

## Run locally

Requires Node.js 20 or newer.

1. Install dependencies from this folder: `npm install`, `npm install --prefix Backend`, and `npm install --prefix frontend`.
2. Copy `Backend/.env.example` to `Backend/.env` and set a private manager name, email, and password (at least 12 characters).
3. Create the initial manager account once with `npm run create-manager`, then remove `ADMIN_PASSWORD` from `Backend/.env`.
4. Start both apps with `npm run dev`.
5. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API runs on port 4000.

After creating the manager account, sign in from the **Staff** button using `ADMIN_EMAIL` and the password you set. If the app is already running, restart it after changing `.env`. Customers can create an account from the reservation section. Managers can create individual staff accounts in **Staff accounts** and review **Team activity**. Staff account credentials are stored as password hashes; session identifiers are stored as hashes and set in HTTP-only cookies.

Reservations show live table availability for the selected date, time, and party size. Each booking occupies its assigned table for 90 minutes; overlapping bookings cannot be confirmed on the same table, and the final assignment is checked again when staff save it. Reservation start times must allow the full 90-minute visit before the restaurant closes at 10:00 pm. Requests stay unassigned until staff confirm and assign an available table.

Order checkout collects an email and phone number, attempts a receipt email over SMTP and a confirmation SMS through Hubtel, and shows each channel's actual delivery status. Reservation requests and staff reservation status changes also attempt to notify the customer's account email and phone. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`, plus `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, and an approved `HUBTEL_SENDER_ID`, in the private `Backend/.env`. Until configured, orders and reservations are still saved; the interface reports that email/SMS delivery is not configured rather than claiming a message was sent. The printed/email order document confirms an order; this app does not process payments or issue a payment receipt.

The API also runs on its own with `npm start --prefix Backend`; the production React bundle can be created with `npm run build`.

## Deploy to Render

`render.yaml` defines one Node web service that builds the React frontend, serves it and the Express API from the same HTTPS origin, and stores SQLite under a persistent disk. The service and disk are paid Render resources; do not switch the service to a plan that does not support persistent disks, or the restaurant data will not be durable.

1. Push this repository to GitHub and import `NewtonOduro/OrderPulse` in the Render dashboard using **New + → Blueprint**. Review the `orderpulse` service and its persistent disk before creating it.
2. When prompted for the unsynced environment values, enter the manager's name and email, and set a unique randomly generated password of at least 12 characters. Enter secrets only in Render's dashboard, never in GitHub or chat.
3. After the first deploy is healthy, open the service's Shell and run `npm run create-manager --prefix Backend` once. Then remove `ADMIN_PASSWORD` from the service's environment and save/redeploy. Keep the manager email and password in a password manager.
4. Check `/api/health`, then test a customer registration, a menu order, reservation availability, and manager sign-in on the public HTTPS URL. The database starts fresh on Render; local orders, accounts, reservations, and menu edits are not copied automatically.
5. Set up and test SMTP and Hubtel credentials in Render if order and reservation email/SMS notifications are required. The application does not take online payments; checkout currently records pickup or dine-in orders for payment at the restaurant.
6. Before accepting real customer data, arrange regular off-instance backups of the SQLite database and test restoring one. A persistent disk protects data across service deploys, but is not a backup. Configure an owned custom domain in Render if desired; Render provides HTTPS for the service and verified custom domains.

## API overview

- `GET /api/menu`, `POST /api/orders`, and customer account endpoints support guest browsing, ordering, and sign-in.
- `POST /api/order-tracking` retrieves order progress when given the confirmation number and checkout phone number.
- `GET /api/reservation-availability?date=YYYY-MM-DD&time=HH:MM&partySize=N` lists tables that can seat the party without overlapping another confirmed or seated 90-minute booking.
- `POST /api/bookings` requires an authenticated customer account; staff assign a table when confirming a request.
- `PATCH /api/staff/menu/:id/stock` updates tracked stock quantity and its low-stock alert threshold.
- Menu categories are validated by the API; drinks must specify a beverage group, and known drink subcategories must be paired with a compatible group.
- Sign-in/registration, order and tracking requests, reservations, and job-application submissions are rate-limited per client IP.
- `/api/staff/*` endpoints require an active staff or manager session. `/api/manager/*` requires a manager session.
- `GET /api/health` reports API readiness.

The layout adapts to mobile phones, tablets, and desktop screens. This is a local-first starter, not a production deployment configuration. Before exposing it publicly, configure HTTPS, protect manager bootstrap credentials, set up database backups, and integrate a payment provider.

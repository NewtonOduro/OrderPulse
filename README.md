# OrderPulse

A Ghana-focused restaurant ordering and operations starter built with React, Tailwind CSS, Express, and PostgreSQL. Prices are stored as integer pesewas and shown to guests in GH₵.

## Reference project comparison

The three reference repositories were reviewed and removed after their relevant feature ideas were incorporated into this original application.

| Reference | What it contributes | How it informed this app |
| --- | --- | --- |
| reshniVisionX | MERN-style project with table bookings, ordering, customer history, and admin dish/order/report screens; dependencies show both MongoDB and MySQL drivers. | Booking, order, and staff-management feature ideas. |
| Himanshu-25 | React menu/cart/checkout paired with an Express/MySQL backend. | Guest menu browsing and checkout flow. |
| codx-ak | React screens for menu, orders, and table bookings/layout; no separate Express server or database manifest. | Table and order workflow ideas. |

This app uses a PostgreSQL database for persistent restaurant data. The UI and API are original, and the food/restaurant photography uses licensed/source-provided and replacement assets rather than copying reference-project code.

## Project layout

- `Backend/` contains the Express API, server tests, and backend environment configuration.
- `frontend/` contains the React, Tailwind CSS, and Vite application.
- The PostgreSQL database schema and starter records are initialized by the API on startup.
- The root `package.json` provides convenience commands to run, build, test, and initialize the manager account.

## Included workflows

- Guest menu browsing split into Local food, Foreign foods, and Drinks (including a separate wine subsection), plus a bag, pickup/dine-in order submission, and GH₵ totals.
- Guest account registration and sign-in, with reservations linked to the signed-in customer's account.
- Individual staff sign-ins, with a manager-only dashboard for team activity, staff accounts, restaurant summaries, reservations, tables, menu, orders, and kitchen operations.
- A persistent audit log records the authenticated staff member, action, affected area, and timestamp for successful operational changes.
- PostgreSQL persistence for customer/staff accounts, sessions, activity, menu, orders, order items, bookings, applications, and tables. The schema and starter menu/table records are initialized when the API starts.
- Staff can optionally track per-dish stock counts and low-stock thresholds. Successful orders decrement tracked stock atomically; zero-stock dishes leave the guest menu and cannot be ordered. Blank stock quantities remain untracked, and staff can still manually mark a dish unavailable.
- Managers can create, edit, price, categorize, and move menu items between Local food, Foreign food, Starters, Soups and Salads, Main Courses, Side Dishes, Desserts, Sandwiches and Burgers, Pasta and Noodles, Kids Menu, and Drinks. Drinks can be arranged under Non-Alcoholic, Alcoholic, or Functional & Specialty beverage groups and the matching hot/cold, juice, beer, wine, spirits, cocktail, or zero-proof subcategories. Staff can view the menu and mark an item unavailable; menu edits and stock management are manager-only.
- Customers can look up an order using its confirmation number and checkout phone number. The tracker shows the kitchen status and refreshes automatically while the order is active.
- Menu records are seeded idempotently from the supplied food-photo references; unrelated pins (including the paella, rice-served Nigerian soup/jollof, hidden soda-can safe, and non-wine spirits) are omitted. The supplied Red Red photo is stored locally at `frontend/public/images/red-red.jpg`.

The added menu prices are starter estimates in Ghana cedis because no prices were supplied. Update them in the staff Menu workspace before taking real customer orders.

## Run locally

Requires Node.js 20 or newer.

1. Install dependencies from this folder: `npm install`, `npm install --prefix Backend`, and `npm install --prefix frontend`.
2. Create a PostgreSQL database (for example, a Neon project), copy `Backend/.env.example` to `Backend/.env`, and set `DATABASE_URL` to its private connection string. Neon connection strings should include `sslmode=require`.
3. To carry the existing menu and tables to Neon, run `npm --prefix Backend run import-menu-data -- ..\database\restaurant.sqlite` before starting the app. The importer only carries menu and table data, removes duplicate menu names (preferring an available listing, then the newest record), and refuses to write to a Neon database that already contains data. Python 3 must be installed for this one-time import.
4. Set a private manager name, email, and password (at least 12 characters). Create the initial manager account once with `npm run create-manager`, then remove `ADMIN_PASSWORD` from `Backend/.env`.
5. Start both apps with `npm run dev`.
6. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API runs on port 4000.

After creating the manager account, sign in from the **Staff** button using `ADMIN_EMAIL` and the password you set. If the app is already running, restart it after changing `.env`. Customers can create an account from the reservation section. Managers can create individual staff accounts in **Staff accounts** and review **Team activity**. Staff account credentials are stored as password hashes; session identifiers are stored as hashes and set in HTTP-only cookies.

Reservations show live table availability for the selected date, time, and party size. Each booking occupies its assigned table for 90 minutes; overlapping bookings cannot be confirmed on the same table, and the final assignment is checked again when staff save it. Reservation start times must allow the full 90-minute visit before the restaurant closes at 10:00 pm. Requests stay unassigned until staff confirm and assign an available table.

Order checkout collects an email and phone number, attempts an order confirmation email over SMTP, and shows the email delivery status. The phone number is retained for order lookup and contact details; the app does not send SMS messages. Reservation requests and staff reservation status changes attempt to notify the customer's account email. New order and reservation requests are also emailed to the staff inbox configured in `STAFF_NOTIFICATION_EMAIL`. Job applicants receive an email acknowledgment, and the hiring inbox configured in `JOB_APPLICATION_NOTIFICATION_EMAIL` receives applicant details and the CV attachment. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the private environment settings for both local development and Render. Until email is configured, orders and reservations are still saved and the interface reports that email delivery is not configured rather than claiming a message was sent. The printed/email order document confirms an order; this app does not process payments or issue a payment receipt.

The API also runs on its own with `npm start --prefix Backend`; the production React bundle can be created with `npm run build`.

## Deploy to Render

`render.yaml` defines a free Node web service that builds the React frontend and serves it and the Express API from the same HTTPS origin. Restaurant data is stored in PostgreSQL, not on the Render service filesystem; configure a PostgreSQL provider such as Neon so service restarts and redeploys do not erase it. Render's free web service may sleep when idle, so it is suitable for a low-cost launch/test but may not meet always-on production needs.

1. Create a PostgreSQL database with your provider and copy its private connection string. Do not share it in chat or commit it to the repository.
2. Push this repository to GitHub, then import `NewtonOduro/OrderPulse` in the Render dashboard using **New + → Blueprint**. Choose the free service plan, connect the `main` branch, and provide the PostgreSQL connection string as `DATABASE_URL` in Render's private environment settings.
3. The local Neon setup has already created the manager account. Do not run the manager bootstrap command a second time; sign in with the account you configured locally.
4. Check `/api/health`, then test a customer registration, a menu order, reservation availability, and manager sign-in on the public HTTPS URL. If you do not run the one-time importer first, Neon starts with the default seeded menu and tables; existing local accounts, orders, reservations, applications, and activity history are not imported.
5. Set `STAFF_NOTIFICATION_EMAIL` and `JOB_APPLICATION_NOTIFICATION_EMAIL` to the appropriate inboxes, then set up and test SMTP credentials in Render for order, reservation, and job-application emails. The application does not take online payments; checkout currently records pickup or dine-in orders for payment at the restaurant.
6. Arrange regular database backups with the PostgreSQL provider and test restoring one. Configure an owned custom domain in Render if desired; Render provides HTTPS for the service and verified custom domains.

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

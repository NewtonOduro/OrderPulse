# OrderPulse

A Ghana-focused restaurant ordering and operations app built with React, Tailwind CSS, Express, MySQL, and Paystack. Prices are stored as integer pesewas and shown to guests in GH₵. The restaurant is based in Ahodwo, Kumasi.

## Reference project comparison

The three reference repositories were reviewed and removed after their relevant feature ideas were incorporated into this original application.

| Reference | What it contributes | How it informed this app |
| --- | --- | --- |
| reshniVisionX | MERN-style project with table bookings, ordering, customer history, and admin dish/order/report screens; dependencies show both MongoDB and MySQL drivers. | Booking, order, and staff-management feature ideas. |
| Himanshu-25 | React menu/cart/checkout paired with an Express/MySQL backend. | Guest menu browsing and checkout flow. |
| codx-ak | React screens for menu, orders, and table bookings/layout; no separate Express server or database manifest. | Table and order workflow ideas. |

This app uses a MySQL 8-compatible database for persistent restaurant data. The UI and API are original, and the food/restaurant photography uses licensed/source-provided and replacement assets rather than copying reference-project code.

## Project layout

- `Backend/` contains the Express API, server tests, and backend environment configuration.
- `frontend/` contains the React, Tailwind CSS, and Vite application.
- The MySQL database schema and starter records are initialized by the API on startup.
- The root `package.json` provides convenience commands to run, build, test, and initialize the manager account.

## Included workflows

- Guest menu browsing split into Local food, Foreign foods, and Drinks (including a separate wine subsection), plus a bag, pickup/dine-in order submission, and GH₵ totals.
- Guest account registration and sign-in, with reservations linked to the signed-in customer's account. New customer and staff accounts must verify their email before signing in; users can request expiring password-reset links.
- Individual staff sign-ins, with a manager-only dashboard for team activity, staff accounts, restaurant summaries, reservations, tables, menu, orders, and kitchen operations.
- A persistent audit log records the authenticated staff member, action, affected area, and timestamp for successful operational changes.
- MySQL persistence for customer/staff accounts, sessions, activity, menu, orders, order items, bookings, applications, and tables. The schema and starter menu/table records are initialized when the API starts.
- Staff can optionally track per-dish stock counts and low-stock thresholds. Successful orders decrement tracked stock atomically; zero-stock dishes leave the guest menu and cannot be ordered. Blank stock quantities remain untracked, and staff can still manually mark a dish unavailable.
- Managers can create, edit, price, categorize, and move menu items between Local food, Foreign food, Starters, Soups and Salads, Main Courses, Side Dishes, Desserts, Sandwiches and Burgers, Pasta and Noodles, Kids Menu, and Drinks. Drinks can be arranged under Non-Alcoholic, Alcoholic, or Functional & Specialty beverage groups and the matching hot/cold, juice, beer, wine, spirits, cocktail, or zero-proof subcategories. Staff can view the menu and mark an item unavailable; menu edits and stock management are manager-only.
- Customers can look up an order using its confirmation number and checkout phone number. The tracker shows the kitchen status and refreshes automatically while the order is active.
- Menu records are seeded idempotently from the supplied food-photo references; unrelated pins (including the paella, rice-served Nigerian soup/jollof, hidden soda-can safe, and non-wine spirits) are omitted. The supplied Red Red photo is stored locally at `frontend/public/images/red-red.jpg`.

The added menu prices are starter estimates in Ghana cedis because no prices were supplied. Update them in the staff Menu workspace before taking real customer orders.

## Run locally

Requires Node.js 20 or newer.

1. Install dependencies from this folder: `npm install`, `npm install --prefix Backend`, and `npm install --prefix frontend`.
2. Create a MySQL 8-compatible database with a provider that supports remote TLS connections. Copy `Backend/.env.example` to `Backend/.env` and set `MYSQL_URL` and `MYSQL_SSL=true` as required by that provider. If the provider uses a private CA (as Aiven may), set `MYSQL_SSL_CA` to its PEM certificate. Render does not host managed MySQL databases; the production app must connect to an external MySQL service.
3. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` (at least 12 characters). On first startup the API creates the manager if the MySQL database has no manager yet. After confirming manager sign-in, remove `ADMIN_PASSWORD` from the local and Render environments. `npm run create-manager` is also available for local setup.
4. Configure Brevo for transactional email: verify a sender address in Brevo, then set `BREVO_API_KEY` and `EMAIL_FROM` to the API key and verified sender email address. Verification and password-reset links are sent through Brevo's HTTPS API. Gmail API OAuth and SMTP remain supported as fallback options when Brevo is not configured.
5. Set `PAYSTACK_SECRET_KEY` to a Paystack test key for development. The app creates the order on the server, redirects to Paystack, and marks it paid only after server-side verification. For live payments, complete Paystack account onboarding and use its live secret key.
6. Start both apps with `npm run dev`.
7. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Express API runs on port 4000.

Sign in from the **Staff** button using `ADMIN_EMAIL` and the password configured for the first manager. Customers can create an account from the reservation section and must verify their email before signing in. Managers can create individual staff accounts in **Staff accounts**; each staff member must verify their work email and can request a password reset from the staff sign-in screen. Staff account credentials and email-action tokens are stored as hashes; session identifiers are stored as hashes and set in HTTP-only cookies.

### Brevo email setup

1. In Brevo, create an API key and verify the sender email address you want the app to use.
2. Set `BREVO_API_KEY` to the API key and `EMAIL_FROM` to the verified sender's bare email address (for example, `orders@example.com`). Keep the API key private; never commit it or place it in frontend configuration.
3. Set `PUBLIC_APP_URL` to the app's public URL so verification and password-reset links return to the correct site.

### Gmail API OAuth setup (fallback)

1. In Google Cloud Console, create a project, enable the Gmail API, and configure the OAuth consent screen. Add the Gmail account that will send restaurant email as a test user while setting this up.
2. Create an OAuth client ID and add `https://developers.google.com/oauthplayground` as an authorized redirect URI for a web client.
3. Open Google OAuth Playground settings, enable **Use your own OAuth credentials**, and enter that client ID and secret. In Step 1, request `https://www.googleapis.com/auth/gmail.send` and authorize with the same Gmail account that will be configured as `GMAIL_USER`.
4. Exchange the authorization code in Step 2 and copy the refresh token. Set `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in the backend environment or Render's private environment settings. Never commit or share the client secret or refresh token.

An OAuth consent screen left in **Testing** mode produces refresh tokens that expire after seven days. For continuous email delivery, move the consent screen to **In production**; Google may require additional app verification depending on how the OAuth app is configured. Gmail API sends through HTTPS, so the Render service does not need a custom sender domain.

Reservations show live table availability for the selected date, time, and party size. Each booking occupies its assigned table for 90 minutes; overlapping bookings cannot be confirmed on the same table, and the final assignment is checked again when staff save it. Reservation start times must allow the full 90-minute visit before the restaurant closes at 10:00 pm. Requests stay unassigned until staff confirm and assign an available table.

Order checkout collects an email and phone number and sends customers to Paystack. The backend verifies the transaction reference, GHS currency, amount, and customer email before changing an order to paid; staff cannot manually mark unpaid orders as paid. Set the Paystack webhook URL to `https://YOUR-RENDER-SERVICE.onrender.com/api/paystack/webhook` so successful events can also be verified if the customer closes the checkout return page. The receipt screen offers both PDF download and browser printing. The phone number is retained for order lookup; the app does not send SMS messages. Reservation requests and staff reservation status changes attempt to notify the customer's account email. New order and reservation requests are also emailed to the staff inbox configured in `STAFF_NOTIFICATION_EMAIL`. New customer and staff accounts receive email-verification links; users can request password-reset links. Verification links expire after 30 seconds and password-reset links after one hour. Job applicants receive an email acknowledgment, and the hiring inbox configured in `JOB_APPLICATION_NOTIFICATION_EMAIL` receives applicant details and the CV attachment. Brevo is the preferred provider; Gmail API OAuth, Gmail SMTP, and Resend remain available as alternatives.

The API also runs on its own with `npm start --prefix Backend`; the production React bundle can be created with `npm run build`.

## Deploy to Render

`render.yaml` defines a free Node web service that builds the React frontend and serves it and the Express API from the same HTTPS origin. Restaurant data is stored in MySQL, not on the Render service filesystem; configure an external MySQL provider with TLS because Render does not provide a managed MySQL database. Render's free web service may sleep when idle, so it is suitable for a low-cost launch/test but may not meet always-on production needs.

1. Create a MySQL 8-compatible database with your provider. Copy its private connection URL; never share it or commit it to the repository. If using Aiven, download the CA certificate from the service overview.
2. Push this repository to GitHub, then import `NewtonOduro/OrderPulse` in the Render dashboard using **New + → Blueprint**. Choose the free service plan, connect the `main` branch, and set `MYSQL_URL`, `MYSQL_SSL=true`, `MYSQL_SSL_CA` (the provider CA certificate, when required), `PAYSTACK_SECRET_KEY`, `ADMIN_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` in Render's private environment settings. Keep TLS certificate verification enabled; do not work around certificate errors by disabling it.
3. Set `PUBLIC_APP_URL` to the Render HTTPS URL. After the first successful startup creates the manager, verify manager sign-in and remove `ADMIN_PASSWORD` from Render. The old PostgreSQL data is not copied automatically; the new MySQL database starts with the seeded menu and tables, and existing users, orders, reservations, applications, and activity history must be migrated separately or recreated.
4. Set `BREVO_API_KEY` and the verified sender's bare email address in `EMAIL_FROM` in Render's private environment settings to enable customer/staff verification, password reset, receipts, and notifications. Both values are declared as private environment settings in the Render blueprint. Add `STAFF_NOTIFICATION_EMAIL` and `JOB_APPLICATION_NOTIFICATION_EMAIL` for staff and hiring notices. Alternatively, configure the four Gmail OAuth values; if the Google OAuth consent screen remains in Testing mode, its refresh token expires after seven days.
5. Configure the Paystack webhook as `https://YOUR-RENDER-SERVICE.onrender.com/api/paystack/webhook`, then test a Paystack test transaction, its callback verification, email verification, password reset, and manager login before switching to live keys.
6. Arrange regular backups with the MySQL provider and test restoring one. Render provides HTTPS for its `onrender.com` URL; you do not need to buy a domain for that URL.

## API overview

- `GET /api/menu`, `POST /api/orders`, and customer account endpoints support guest browsing, ordering, and sign-in.
- `POST /api/order-tracking` retrieves order progress when given the confirmation number and checkout phone number.
- `POST /api/orders` initializes Paystack checkout and returns an authorization URL; `POST /api/payments/verify` verifies the Paystack reference.
- `POST /api/paystack/webhook` validates Paystack's HMAC signature and confirms successful transactions server-side.
- `GET /api/reservation-availability?date=YYYY-MM-DD&time=HH:MM&partySize=N` lists tables that can seat the party without overlapping another confirmed or seated 90-minute booking.
- `POST /api/bookings` requires an authenticated customer account; staff assign a table when confirming a request.
- `PATCH /api/staff/menu/:id/stock` updates tracked stock quantity and its low-stock alert threshold.
- Menu categories are validated by the API; drinks must specify a beverage group, and known drink subcategories must be paired with a compatible group.
- Sign-in/registration, order and tracking requests, reservations, and job-application submissions are rate-limited per client IP.
- `/api/staff/*` endpoints require an active staff or manager session. `/api/manager/*` requires a manager session.
- `GET /api/health` reports API readiness.

The layout adapts to mobile phones, tablets, and desktop screens. Before exposing it publicly, configure Paystack and Brevo secrets, remove the initial manager password after bootstrap, and set up database backups.

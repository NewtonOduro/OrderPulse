import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";

process.env.PG_MEM_TEST = "1";
for (const key of [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STAFF_NOTIFICATION_EMAIL",
  "JOB_APPLICATION_NOTIFICATION_EMAIL",
]) {
  process.env[key] = "";
}
const { createEmailAuthToken } = await import("../src/email-auth.js");
const { app } = await import("../src/app.js");
const { db } = await import("../src/database.js");
let server;
let baseUrl;
let managerCookie;

function sessionCookie(response) {
  return response.headers.get("set-cookie")?.split(";")[0];
}

before(async () => {
  const passwordHash = await bcrypt.hash("test-manager-password-123", 4);
  await db.run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'manager')", [
    "Test Manager",
    "manager@test.example",
    passwordHash,
  ]);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@test.example", password: "test-manager-password-123" }),
  });
  managerCookie = sessionCookie(login);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

test("menu API returns items priced in Ghana cedis", async () => {
  const response = await fetch(`${baseUrl}/api/menu`);
  const items = await response.json();
  assert.equal(response.status, 200);
  assert.equal(items.length, 35);
  assert.equal(typeof items[0].price, "number");
  assert.equal(typeof items[0].imageUrl, "string");
  assert.equal(items.filter((item) => item.category === "Local food").length, 15);
  assert.equal(items.filter((item) => item.category === "Foreign food").length, 7);
  assert.equal(items.filter((item) => item.category === "Drinks").length, 13);
  assert.equal(items.filter((item) => item.referenceUrl).length, 24);
  assert.ok(items.every((item) => item.available));
  assert.ok(!items.some((item) => item.name === "Fufuo with light soup"));
  assert.ok(items.some((item) => item.name === "Red red & fried plantain" && item.imageUrl === "/images/red-red.jpg"));
  assert.ok(!items.some((item) => /paella|soda can safe|nigerian jollof/i.test(item.name)));
});

test("serves the production frontend and client routes when the frontend is built", {
  skip: !existsSync(new URL("../../frontend/dist/index.html", import.meta.url)),
}, async () => {
  const home = await fetch(baseUrl);
  const homeHtml = await home.text();
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.match(homeHtml, /OrderPulse/);

  const menu = await fetch(`${baseUrl}/menu`);
  assert.equal(menu.status, 200);
  assert.equal(await menu.text(), homeHtml);

  const unknownApi = await fetch(`${baseUrl}/api/unknown`);
  assert.doesNotMatch(unknownApi.headers.get("content-type") || "", /text\/html/);
});

test("orders are validated and persisted with a cedi total", async () => {
  const instructionsResponse = await fetch(`${baseUrl}/api/payment-instructions`);
  assert.equal(instructionsResponse.status, 200);
  assert.deepEqual(await instructionsResponse.json(), {
    method: "MoMo",
    number: "0545567500",
    accountName: "Collins Oduro",
  });
  const [firstItem] = await (await fetch(`${baseUrl}/api/menu`)).json();
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Ama Mensah",
      customerEmail: "ama@example.com",
      phone: "0241234567",
      orderType: "pickup",
      items: [{ id: firstItem.id, quantity: 2 }],
    }),
  });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.match(result.orderNumber, /^GH-[A-F0-9]{32}$/);
  assert.equal(result.total, firstItem.price * 2);
  assert.equal(result.customerEmail, "ama@example.com");
  assert.equal(result.items[0].name, firstItem.name);
  assert.equal(result.status, "awaiting_payment");
  assert.equal(result.paymentStatus, "pending");
  assert.deepEqual(result.paymentInstructions, {
    method: "MoMo",
    number: "0545567500",
    accountName: "Collins Oduro",
  });
  assert.equal(result.notifications.email.status, "not_configured");
  assert.equal(result.notifications.staffEmail.status, "no_recipient");

  const lookup = (lookupPhone) =>
    fetch(`${baseUrl}/api/order-tracking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNumber: result.orderNumber, phone: lookupPhone }),
    });
  assert.equal((await lookup("0200000000")).status, 404);
  const tracked = await lookup("024 123-4567");
  assert.equal(tracked.status, 200);
  const trackedBeforePayment = await tracked.json();
  assert.equal(trackedBeforePayment.status, "awaiting_payment");
  assert.equal(trackedBeforePayment.paymentStatus, "pending");
  assert.deepEqual(trackedBeforePayment.paymentInstructions, result.paymentInstructions);
  const staffOrders = await (await fetch(`${baseUrl}/api/staff/orders`, {
    headers: { cookie: managerCookie },
  })).json();
  const trackedOrder = staffOrders.find((order) => order.orderNumber === result.orderNumber);
  assert.ok(trackedOrder);
  assert.equal(trackedOrder.paymentStatus, "pending");
  const pendingSalesSummary = await fetch(`${baseUrl}/api/manager/summary`, {
    headers: { cookie: managerCookie },
  });
  assert.equal((await pendingSalesSummary.json()).salesToday, 0);

  const prematurePreparation = await fetch(`${baseUrl}/api/staff/orders/${trackedOrder.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "preparing" }),
  });
  assert.equal(prematurePreparation.status, 409);

  const paymentConfirmation = await fetch(`${baseUrl}/api/staff/orders/${trackedOrder.id}/payment`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ paymentStatus: "paid" }),
  });
  const paidOrder = await paymentConfirmation.json();
  assert.equal(paymentConfirmation.status, 200);
  assert.equal(paidOrder.paymentStatus, "paid");
  assert.equal(paidOrder.status, "received");
  assert.equal(paidOrder.notification.status, "not_configured");
  const confirmedSalesSummary = await fetch(`${baseUrl}/api/manager/summary`, {
    headers: { cookie: managerCookie },
  });
  assert.equal((await confirmedSalesSummary.json()).salesToday, result.total);
  const duplicatePaymentConfirmation = await fetch(`${baseUrl}/api/staff/orders/${trackedOrder.id}/payment`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ paymentStatus: "paid" }),
  });
  assert.equal(duplicatePaymentConfirmation.status, 409);

  for (const status of ["preparing", "ready", "completed"]) {
    const update = await fetch(`${baseUrl}/api/staff/orders/${trackedOrder.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: managerCookie },
      body: JSON.stringify({ status }),
    });
    assert.equal(update.status, 200);
    const refreshed = await lookup("0241234567");
    const refreshedOrder = await refreshed.json();
    assert.equal(refreshedOrder.status, status);
    assert.equal(refreshedOrder.paymentStatus, "paid");
  }
});

test("customers must create an account or sign in before reserving", async () => {
  const invalid = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerName: "A", partySize: 0 }),
  });
  assert.equal(invalid.status, 401);

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Kojo Asare",
      email: "kojo@example.com",
      phone: "0201234567",
      password: "guest-account-password-123",
    }),
  });
  const registration = await registered.json();
  assert.equal(registered.status, 201);
  assert.match(registration.message, /verify your address/i);
  assert.equal(registration.verificationEmail.status, "not_configured");
  assert.equal(sessionCookie(registered), undefined);
  const registeredUser = await db.get("SELECT id, email_verified FROM users WHERE email = ?", ["kojo@example.com"]);
  assert.equal(registeredUser.email_verified, false);
  const unverifiedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "kojo@example.com", password: "guest-account-password-123" }),
  });
  assert.equal(unverifiedLogin.status, 403);
  assert.equal((await unverifiedLogin.json()).code, "EMAIL_NOT_VERIFIED");

  const verificationToken = await createEmailAuthToken(registeredUser.id, "verify_email");
  const storedVerificationToken = await db.get("SELECT token_hash FROM email_auth_tokens WHERE purpose = 'verify_email' ORDER BY id DESC LIMIT 1");
  assert.equal(storedVerificationToken.token_hash, createHash("sha256").update(verificationToken).digest("hex"));
  const verification = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(verification.status, 200);
  assert.equal((await verification.json()).email, "kojo@example.com");
  const reusedVerification = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: verificationToken }),
  });
  assert.equal(reusedVerification.status, 400);
  const verifiedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "kojo@example.com", password: "guest-account-password-123" }),
  });
  const customerCookie = sessionCookie(verifiedLogin);
  assert.equal(verifiedLogin.status, 200);

  const invalidWithAccount = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: customerCookie },
    body: JSON.stringify({ customerName: "A", partySize: 0 }),
  });
  assert.equal(invalidWithAccount.status, 400);

  const loggedIn = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: customerCookie } });
  assert.equal((await loggedIn.json()).user.email, "kojo@example.com");

  const valid = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Kojo Asare",
      phone: "0201234567",
      date: "2027-01-20",
      time: "19:00",
      partySize: 4,
    }),
  });
  assert.equal(valid.status, 401);

  const authenticatedBooking = await fetch(`${baseUrl}/api/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: customerCookie },
    body: JSON.stringify({
      date: "2027-01-20",
      time: "19:00",
      partySize: 4,
      notes: "Window table, please",
    }),
  });
  const result = await authenticatedBooking.json();
  assert.equal(authenticatedBooking.status, 201);
  assert.equal(result.status, "requested");
  assert.equal(result.notifications.email.status, "not_configured");
  assert.equal(result.notifications.staffEmail.status, "no_recipient");
  const customerBookings = await fetch(`${baseUrl}/api/customer/reservations`, { headers: { cookie: customerCookie } });
  assert.equal((await customerBookings.json()).length, 1);

  const cancelReservation = () =>
    fetch(`${baseUrl}/api/staff/reservations/${result.bookingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: managerCookie },
      body: JSON.stringify({ status: "cancelled" }),
    });
  const cancelled = await cancelReservation();
  const cancelledResult = await cancelled.json();
  assert.equal(cancelled.status, 200);
  assert.equal(cancelledResult.status, "cancelled");
  assert.equal(cancelledResult.notifications.email.status, "not_configured");
  assert.equal(cancelledResult.notifications.staffEmail, undefined);
  const unchanged = await cancelReservation();
  assert.equal(unchanged.status, 200);
  assert.equal((await unchanged.json()).notifications, undefined);

  const resetRequest = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "kojo@example.com" }),
  });
  assert.equal(resetRequest.status, 202);
  const unknownResetRequest = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "unknown@example.com" }),
  });
  assert.equal(unknownResetRequest.status, 202);
  assert.equal((await unknownResetRequest.json()).message, (await resetRequest.json()).message);
  const expiredToken = await createEmailAuthToken(registeredUser.id, "reset_password");
  const expiredTokenHash = createHash("sha256").update(expiredToken).digest("hex");
  await db.run("UPDATE email_auth_tokens SET expires_at = ? WHERE token_hash = ?", ["2000-01-01T00:00:00.000Z", expiredTokenHash]);
  const expiredReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: expiredToken, password: "new-guest-account-password-456" }),
  });
  assert.equal(expiredReset.status, 400);
  const resetToken = await createEmailAuthToken(registeredUser.id, "reset_password");
  const reset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "new-guest-account-password-456" }),
  });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).email, "kojo@example.com");
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: customerCookie } })).status, 401);
  const resetLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "kojo@example.com", password: "new-guest-account-password-456" }),
  });
  assert.equal(resetLogin.status, 200);
  const reusedReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "another-password-123456" }),
  });
  assert.equal(reusedReset.status, 400);
});

test("reservation availability checks seating capacity and blocks overlapping 90-minute bookings", async () => {
  const date = "2027-02-01";
  const partySize = 4;
  const getAvailability = (time, size = partySize) =>
    fetch(`${baseUrl}/api/reservation-availability?date=${date}&time=${time}&partySize=${size}`);
  const initial = await getAvailability("18:00");
  const initialAvailability = await initial.json();
  assert.equal(initial.status, 200);
  assert.equal(initialAvailability.durationMinutes, 90);
  const table = initialAvailability.tables.find((candidate) => candidate.seats >= partySize);
  assert.ok(table);
  assert.ok(!(await (await getAvailability("18:00", 9)).json()).tables.some((candidate) => candidate.id === table.id));
  assert.equal((await getAvailability("not-a-date")).status, 400);
  assert.equal((await getAvailability("21:00")).status, 400);

  const guest = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Availability Guest",
      email: "availability@example.com",
      phone: "0201111222",
      password: "availability-password-123",
    }),
  });
  assert.equal(guest.status, 201);
  const availabilityUser = await db.get("SELECT id FROM users WHERE email = ?", ["availability@example.com"]);
  const availabilityToken = await createEmailAuthToken(availabilityUser.id, "verify_email");
  const availabilityVerification = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: availabilityToken }),
  });
  assert.equal(availabilityVerification.status, 200);
  const availabilityLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "availability@example.com", password: "availability-password-123" }),
  });
  const guestCookie = sessionCookie(availabilityLogin);
  const makeBooking = (time) =>
    fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: guestCookie },
      body: JSON.stringify({ date, time, partySize, notes: "" }),
    });
  const firstBooking = await makeBooking("18:00");
  assert.equal(firstBooking.status, 201);
  const firstBookingId = (await firstBooking.json()).bookingId;

  const confirmFirst = await fetch(`${baseUrl}/api/staff/reservations/${firstBookingId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "confirmed", tableId: table.id }),
  });
  assert.equal(confirmFirst.status, 200);
  const overlapping = await (await getAvailability("19:00")).json();
  assert.ok(!overlapping.tables.some((candidate) => candidate.id === table.id));
  const backToBack = await (await getAvailability("19:30")).json();
  assert.ok(backToBack.tables.some((candidate) => candidate.id === table.id));

  const secondBooking = await makeBooking("19:00");
  assert.equal(secondBooking.status, 201);
  const secondBookingId = (await secondBooking.json()).bookingId;
  const conflict = await fetch(`${baseUrl}/api/staff/reservations/${secondBookingId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "confirmed", tableId: table.id }),
  });
  assert.equal(conflict.status, 409);

  const missingTable = await fetch(`${baseUrl}/api/staff/reservations/${secondBookingId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "confirmed" }),
  });
  assert.equal(missingTable.status, 400);

  const staffReservations = await fetch(`${baseUrl}/api/staff/reservations`, {
    headers: { cookie: managerCookie },
  });
  const reservations = await staffReservations.json();
  assert.equal(staffReservations.status, 200);
  assert.ok(reservations.find((booking) => booking.id === secondBookingId).availableTables.every((candidate) => candidate.id !== table.id));

  const completeFirst = await fetch(`${baseUrl}/api/staff/reservations/${firstBookingId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "completed", tableId: table.id }),
  });
  assert.equal(completeFirst.status, 200);
  assert.ok((await (await getAvailability("19:00")).json()).tables.some((candidate) => candidate.id === table.id));
});

test("individual staff accounts manage service while manager can see named activity logs", async () => {
  const denied = await fetch(`${baseUrl}/api/staff/tables`);
  assert.equal(denied.status, 401);

  const managerHeaders = { "content-type": "application/json", cookie: managerCookie };
  const createdStaff = await fetch(`${baseUrl}/api/manager/staff`, {
    method: "POST",
    headers: managerHeaders,
    body: JSON.stringify({ name: "Kitchen Lead", email: "lead@example.com", password: "staff-account-password-123" }),
  });
  assert.equal(createdStaff.status, 201);
  const newStaff = await createdStaff.json();
  assert.equal(newStaff.role, "staff");
  assert.equal(newStaff.verificationEmail.status, "not_configured");
  const pendingStaffLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "lead@example.com", password: "staff-account-password-123" }),
  });
  assert.equal(pendingStaffLogin.status, 403);
  const staffToken = await createEmailAuthToken(newStaff.id, "verify_email");
  const staffVerification = await fetch(`${baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: staffToken }),
  });
  assert.equal(staffVerification.status, 200);
  const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "lead@example.com", password: "staff-account-password-123" }),
  });
  assert.equal(staffLogin.status, 200);
  const staffCookie = sessionCookie(staffLogin);
  const headers = { "content-type": "application/json", cookie: staffCookie };
  const staffMenuCreate = await fetch(`${baseUrl}/api/staff/menu`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Staff-created dish",
      description: "A test dish that should be manager-only.",
      category: "Local food",
      subcategory: "Test dishes",
      price: 20,
      imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19",
    }),
  });
  assert.equal(staffMenuCreate.status, 403);
  const tableResponse = await fetch(`${baseUrl}/api/staff/tables`, { headers });
  const tables = await tableResponse.json();
  assert.equal(tableResponse.status, 200);
  assert.ok(tables.length >= 1);

  const reservationResponse = await fetch(`${baseUrl}/api/staff/reservations`, { headers });
  const reservations = await reservationResponse.json();
  assert.equal(reservationResponse.status, 200);
  const booking = reservations[0];
  const assigned = await fetch(`${baseUrl}/api/staff/reservations/${booking.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "confirmed", tableId: tables.find((table) => table.seats >= booking.partySize)?.id ?? null }),
  });
  assert.equal(assigned.status, 200);

  const orderResponse = await fetch(`${baseUrl}/api/staff/orders`, { headers });
  const orders = await orderResponse.json();
  const kitchenUpdate = await fetch(`${baseUrl}/api/staff/orders/${orders[0].id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "preparing" }),
  });
  assert.equal(kitchenUpdate.status, 200);
  assert.equal((await kitchenUpdate.json()).status, "preparing");

  const staffForbidden = await fetch(`${baseUrl}/api/manager/activities`, { headers });
  assert.equal(staffForbidden.status, 403);
  const managerActivities = await fetch(`${baseUrl}/api/manager/activities`, { headers: managerHeaders });
  const activities = await managerActivities.json();
  assert.ok(activities.some((activity) => activity.actorName === "Kitchen Lead" && activity.entity === "orders"));
  assert.ok(activities.some((activity) => activity.actorName === "Test Manager" && activity.entity === "team"));
  assert.ok(activities.every((activity) => typeof activity.createdAt === "string"));

  const summary = await fetch(`${baseUrl}/api/manager/summary`, { headers: managerHeaders });
  assert.equal(summary.status, 200);
  assert.equal(typeof (await summary.json()).activeStaff, "number");
  const staffSummary = await fetch(`${baseUrl}/api/staff/summary`, { headers });
  assert.equal(staffSummary.status, 200);
  assert.equal(typeof (await staffSummary.json()).ordersToday, "number");
});

test("managers can add, edit, categorize, stock, and toggle menu items", async () => {
  const headers = { "content-type": "application/json", cookie: managerCookie };
  const missingDrinkGroup = await fetch(`${baseUrl}/api/staff/menu`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Uncategorized beverage",
      description: "A beverage without a selected drink category.",
      category: "Drinks",
      subcategory: "Cold & Soft Drinks",
      price: 12,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
    }),
  });
  assert.equal(missingDrinkGroup.status, 400);

  const response = await fetch(`${baseUrl}/api/staff/menu`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Test sobolo",
      description: "A chilled hibiscus drink for a warm afternoon.",
      category: "Drinks",
      subcategory: "Soft drinks",
      beverageGroup: "Non-Alcoholic Beverages",
      price: 18.5,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
      stockQuantity: 2,
      lowStockThreshold: 1,
    }),
  });
  const item = await response.json();
  assert.equal(response.status, 201);
  assert.equal(item.price, 18.5);
  assert.equal(item.stockQuantity, 2);
  assert.equal(item.lowStockThreshold, 1);

  const duplicateItem = await fetch(`${baseUrl}/api/staff/menu`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "TEST SOBOLO",
      description: "A second listing for the same menu item.",
      category: "Drinks",
      subcategory: "Cold & Soft Drinks",
      beverageGroup: "Non-Alcoholic Beverages",
      price: 18.5,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
    }),
  });
  assert.equal(duplicateItem.status, 400);
  assert.match((await duplicateItem.json()).error, /already on the menu/i);

  const updateResponse = await fetch(`${baseUrl}/api/staff/menu/${item.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      name: "Test sobolo special",
      description: "A chilled hibiscus and ginger drink for a warm afternoon.",
      category: "Drinks",
      subcategory: "Cold & Soft Drinks",
      beverageGroup: "Non-Alcoholic Beverages",
      price: 20,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updatedItem = await updateResponse.json();
  assert.equal(updatedItem.price, 20);
  assert.equal(updatedItem.subcategory, "Cold & Soft Drinks");
  assert.equal(updatedItem.beverageGroup, "Non-Alcoholic Beverages");

  const movedItem = await fetch(`${baseUrl}/api/staff/menu/${item.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      name: "Test sobolo special",
      description: "A chilled hibiscus and ginger drink for a warm afternoon.",
      category: "Desserts",
      subcategory: "Seasonal sweets",
      beverageGroup: null,
      price: 20,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
    }),
  });
  assert.equal(movedItem.status, 200);
  assert.equal((await movedItem.json()).category, "Desserts");

  const invalidBeveragePlacement = await fetch(`${baseUrl}/api/staff/menu/${item.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      name: "Test wine",
      description: "A chilled glass served with a meal.",
      category: "Drinks",
      subcategory: "Wine",
      beverageGroup: "Non-Alcoholic Beverages",
      price: 20,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b",
    }),
  });
  assert.equal(invalidBeveragePlacement.status, 400);

  const unavailable = await fetch(`${baseUrl}/api/staff/menu/${item.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ available: false }),
  });
  assert.equal(unavailable.status, 200);
  assert.equal((await unavailable.json()).available, false);

  const restock = await fetch(`${baseUrl}/api/staff/menu/${item.id}/stock`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ stockQuantity: 2, lowStockThreshold: 1 }),
  });
  assert.equal(restock.status, 200);
  assert.equal((await restock.json()).available, false);

  const makeAvailable = await fetch(`${baseUrl}/api/staff/menu/${item.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ available: true }),
  });
  assert.equal(makeAvailable.status, 200);
  const listed = await makeAvailable.json();
  assert.equal(listed.available, true);
  assert.equal(listed.stockQuantity, 2);

  const orderPayload = (quantity) => ({
    customerName: "Stock Test",
    customerEmail: "stock@example.com",
    phone: "0241234567",
    orderType: "pickup",
    items: [{ id: item.id, quantity }],
  });
  const tooMany = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload(3)),
  });
  assert.equal(tooMany.status, 409);
  const inventoryAfterRejectedOrder = await fetch(`${baseUrl}/api/staff/menu`, { headers });
  assert.equal((await inventoryAfterRejectedOrder.json()).find((candidate) => candidate.id === item.id).stockQuantity, 2);

  const firstOrder = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload(1)),
  });
  assert.equal(firstOrder.status, 201);
  const lowStock = await fetch(`${baseUrl}/api/staff/menu`, { headers });
  const lowStockItem = (await lowStock.json()).find((candidate) => candidate.id === item.id);
  assert.equal(lowStockItem.stockQuantity, 1);

  const secondOrder = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload(1)),
  });
  assert.equal(secondOrder.status, 201);
  const customerMenu = await (await fetch(`${baseUrl}/api/menu`)).json();
  assert.ok(!customerMenu.some((candidate) => candidate.id === item.id));

  const exhaustedOrder = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload(1)),
  });
  assert.equal(exhaustedOrder.status, 409);
});

test("career applications persist CVs and can only be retrieved by managers", async () => {
  const resumeBytes = Buffer.from("%PDF-1.7\nOrderPulse test CV\n%%EOF");
  const applicationPayload = {
    firstName: "Akosua",
    lastName: "Mensah",
    email: "akosua@example.com",
    phone: "0241234567",
    desiredPosition: "Line Cook",
    message: "I have kitchen experience.",
    resumeName: "akosua-cv.pdf",
    resumeType: "application/pdf",
    resumeBase64: resumeBytes.toString("base64"),
    consent: true,
  };
  const invalid = await fetch(`${baseUrl}/api/careers/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...applicationPayload, consent: false }),
  });
  assert.equal(invalid.status, 400);

  const submitted = await fetch(`${baseUrl}/api/careers/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(applicationPayload),
  });
  const submittedApplication = await submitted.json();
  assert.equal(submitted.status, 201);
  assert.match(submittedApplication.applicationNumber, /^OP-\d+$/);
  assert.equal(submittedApplication.notifications.applicantEmail.status, "not_configured");
  assert.equal(submittedApplication.notifications.employerEmail.status, "no_recipient");

  const unauthenticated = await fetch(`${baseUrl}/api/manager/applications`);
  assert.equal(unauthenticated.status, 401);

  const applicationsResponse = await fetch(`${baseUrl}/api/manager/applications`, {
    headers: { cookie: managerCookie },
  });
  const applications = await applicationsResponse.json();
  assert.equal(applicationsResponse.status, 200);
  const application = applications.find((candidate) => candidate.email === "akosua@example.com");
  assert.ok(application);
  assert.equal(application.desiredPosition, "Line Cook");
  assert.equal(application.resumeName, "akosua-cv.pdf");

  const resumeResponse = await fetch(`${baseUrl}/api/manager/applications/${application.id}/resume`, {
    headers: { cookie: managerCookie },
  });
  assert.equal(resumeResponse.status, 200);
  assert.equal(resumeResponse.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await resumeResponse.arrayBuffer()), resumeBytes);
});

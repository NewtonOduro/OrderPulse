import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";

process.env.PG_MEM_TEST = "1";
for (const key of [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "BREVO_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "PUBLIC_APP_URL",
  "GMAIL_USER",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "STAFF_NOTIFICATION_EMAIL",
  "JOB_APPLICATION_NOTIFICATION_EMAIL",
]) {
  process.env[key] = "";
}
process.env.PAYSTACK_SECRET_KEY = "test-paystack-secret";
const nativeFetch = globalThis.fetch;
const paystackInitializations = [];
const brevoMessages = [];
let brevoResponseStatus = 201;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === "https://api.brevo.com/v3/smtp/email") {
    brevoMessages.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ messageId: `test-email-${brevoMessages.length}` }), {
      status: brevoResponseStatus,
    });
  }
  if (url.startsWith("https://api.paystack.co/transaction/initialize")) {
    const payload = JSON.parse(options.body);
    paystackInitializations.push(payload);
    return new Response(JSON.stringify({
      status: true,
      data: {
        authorization_url: `https://checkout.paystack.com/${payload.reference}`,
        reference: payload.reference,
      },
    }), { status: 200 });
  }
  if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
    const reference = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const order = await db.get("SELECT * FROM orders WHERE payment_reference = ?", [reference]);
    if (!order) return new Response(JSON.stringify({ status: false, message: "Not found" }), { status: 404 });
    return new Response(JSON.stringify({
      status: true,
      data: {
        status: "success",
        currency: "GHS",
        amount: order.total_pesewas,
        reference,
        customer: { email: order.customer_email },
      },
    }), { status: 200 });
  }
  return nativeFetch(input, options);
};
const { createEmailAuthToken } = await import("../services/email-auth.js");
const { app } = await import("../routes/app.js");
const { db } = await import("../database/database.js");
let server;
let baseUrl;
let managerCookie;

function sessionCookie(response) {
  return response.headers.get("set-cookie")?.split(";")[0];
}

function restoreEnvironmentValue(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
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

  const [manifestResponse, workerResponse, iconResponse] = await Promise.all([
    fetch(`${baseUrl}/manifest.webmanifest`),
    fetch(`${baseUrl}/service-worker.js`),
    fetch(`${baseUrl}/icons/orderpulse-192.svg`),
  ]);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.equal(workerResponse.status, 200);
  assert.match(await workerResponse.text(), /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.equal(iconResponse.status, 200);

  const unknownApi = await fetch(`${baseUrl}/api/unknown`);
  assert.doesNotMatch(unknownApi.headers.get("content-type") || "", /text\/html/);
});

test("orders are validated and persisted with a cedi total", async () => {
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
  assert.equal(result.paymentUrl, `https://checkout.paystack.com/${result.orderNumber}`);
  assert.equal(result.reference, result.orderNumber);
  const initialization = paystackInitializations.find((entry) => entry.reference === result.reference);
  assert.equal(initialization.amount, Math.round(result.total * 100));
  assert.equal(initialization.currency, "GHS");
  assert.equal(initialization.email, "ama@example.com");
  assert.equal(initialization.metadata.orderNumber, result.orderNumber);
  assert.match(initialization.callback_url, /[?]payment=paystack$/);
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

  const paymentConfirmation = await fetch(`${baseUrl}/api/payments/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ reference: result.reference }),
  });
  const paymentResult = await paymentConfirmation.json();
  const paidOrder = paymentResult.order;
  assert.equal(paymentConfirmation.status, 200);
  assert.equal(paidOrder.paymentStatus, "paid");
  assert.equal(paidOrder.status, "received");
  assert.equal(paymentResult.notification.status, "not_configured");
  const confirmedSalesSummary = await fetch(`${baseUrl}/api/manager/summary`, {
    headers: { cookie: managerCookie },
  });
  assert.equal((await confirmedSalesSummary.json()).salesToday, result.total);
  const duplicatePaymentConfirmation = await fetch(`${baseUrl}/api/payments/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference: result.reference }),
  });
  assert.equal(duplicatePaymentConfirmation.status, 200);
  assert.equal((await duplicatePaymentConfirmation.json()).notification.status, "already_sent");

  const invalidReference = await fetch(`${baseUrl}/api/payments/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference: "UNKNOWN-REFERENCE" }),
  });
  assert.equal(invalidReference.status, 404);

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
    assert.equal(refreshedOrder.feedbackEligible, status === "completed");
  }

  const feedbackPayload = {
    orderNumber: result.orderNumber,
    phone: "0241234567",
    rating: 5,
    comment: "Fresh, delicious, and ready on time.",
  };
  const unauthorizedFeedback = await fetch(`${baseUrl}/api/order-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...feedbackPayload, phone: "0200000000" }),
  });
  assert.equal(unauthorizedFeedback.status, 404);
  const invalidFeedback = await fetch(`${baseUrl}/api/order-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...feedbackPayload, rating: 6 }),
  });
  assert.equal(invalidFeedback.status, 400);
  const submittedFeedback = await fetch(`${baseUrl}/api/order-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedbackPayload),
  });
  assert.equal(submittedFeedback.status, 201);
  assert.equal((await submittedFeedback.json()).feedback.rating, 5);
  const duplicateFeedback = await fetch(`${baseUrl}/api/order-feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(feedbackPayload),
  });
  assert.equal(duplicateFeedback.status, 409);
  const savedFeedback = await lookup("0241234567");
  const trackedWithFeedback = await savedFeedback.json();
  assert.equal(trackedWithFeedback.feedbackEligible, false);
  assert.equal(trackedWithFeedback.feedback.comment, feedbackPayload.comment);
  const feedbackDashboard = await fetch(`${baseUrl}/api/staff/feedback`, { headers: { cookie: managerCookie } });
  assert.equal(feedbackDashboard.status, 200);
  const feedbackData = await feedbackDashboard.json();
  assert.ok(feedbackData.count >= 1);
  assert.ok(feedbackData.averageRating >= 1 && feedbackData.averageRating <= 5);
  assert.ok(feedbackData.feedback.some((entry) => entry.orderNumber === result.orderNumber));

  const guestRewards = await fetch(`${baseUrl}/api/customer/engagement`);
  assert.equal(guestRewards.status, 401);
  const guestPasswordHash = await bcrypt.hash("guest-reward-account-123", 4);
  await db.run(`
    INSERT INTO users (name, email, phone, password_hash, role, email_verified)
    VALUES (?, ?, ?, ?, 'customer', TRUE)
  `, ["Ama Mensah", "ama@example.com", "0241234567", guestPasswordHash]);
  const customerLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ama@example.com", password: "guest-reward-account-123" }),
  });
  assert.equal(customerLogin.status, 200);
  const claimedRewards = await fetch(`${baseUrl}/api/customer/engagement`, {
    headers: { cookie: sessionCookie(customerLogin) },
  });
  assert.ok((await claimedRewards.json()).points >= Math.floor(result.total));
});

test("customers can save favourites, earn and redeem points, use delivery and meal offers, and order by table QR", async () => {
  const passwordHash = await bcrypt.hash("customer-feature-test-123", 4);
  await db.run(`
    INSERT INTO users (name, email, phone, password_hash, role, email_verified)
    VALUES (?, ?, ?, ?, 'customer', TRUE)
  `, ["Feature Customer", "features@test.example", "0241234567", passwordHash]);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "features@test.example", password: "customer-feature-test-123" }),
  });
  assert.equal(login.status, 200);
  const customerCookie = sessionCookie(login);
  const customerHeaders = { "content-type": "application/json", cookie: customerCookie };
  const menu = await (await fetch(`${baseUrl}/api/menu`)).json();
  const menuItem = menu.find((item) => item.price >= 10);
  assert.ok(menuItem);

  const favoriteAdded = await fetch(`${baseUrl}/api/customer/favorites/${menuItem.id}`, {
    method: "POST",
    headers: customerHeaders,
  });
  assert.equal(favoriteAdded.status, 204);
  const favorites = await fetch(`${baseUrl}/api/customer/favorites`, {
    headers: { cookie: customerCookie },
  });
  assert.equal(favorites.status, 200);
  assert.ok((await favorites.json()).some((item) => item.id === menuItem.id));

  const areaResponse = await fetch(`${baseUrl}/api/manager/delivery-areas`, {
    method: "POST",
    headers: { ...customerHeaders, cookie: managerCookie },
    body: JSON.stringify({ name: "Feature Test Area", fee: 3.5 }),
  });
  assert.equal(areaResponse.status, 201);
  const area = await areaResponse.json();
  const dealResponse = await fetch(`${baseUrl}/api/manager/deals`, {
    method: "POST",
    headers: { ...customerHeaders, cookie: managerCookie },
    body: JSON.stringify({
      title: "Feature test special",
      description: "A test-only GH₵5 discount.",
      code: "FEATURE5",
      discount: 5,
    }),
  });
  assert.equal(dealResponse.status, 201);
  const bundleResponse = await fetch(`${baseUrl}/api/manager/meal-bundles`, {
    method: "POST",
    headers: { ...customerHeaders, cookie: managerCookie },
    body: JSON.stringify({
      title: "Feature test bundle",
      description: "A bundle with two featured dishes.",
      price: 25,
      items: [{ id: menuItem.id, quantity: 2 }],
    }),
  });
  assert.equal(bundleResponse.status, 201);
  const bundle = await bundleResponse.json();
  assert.equal(bundle.price, 25);
  assert.deepEqual(bundle.items.map(({ id, quantity }) => ({ id, quantity })), [{ id: menuItem.id, quantity: 2 }]);
  const options = await (await fetch(`${baseUrl}/api/restaurant-options`)).json();
  assert.ok(options.deliveryAreas.some((option) => option.id === area.id && option.fee === 3.5));
  assert.ok(options.deals.some((deal) => deal.code === "FEATURE5"));
  assert.ok(options.bundles.some((option) => option.id === bundle.id && option.price === 25));
  assert.ok(options.tables.length > 0);

  const subtotalPesewas = Math.round(menuItem.price * 20 * 100);
  const placeOrder = (payload) => fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: customerHeaders,
    body: JSON.stringify(payload),
  });
  const bundleOrderResponse = await placeOrder({
    customerName: "Feature Customer",
    customerEmail: "features@test.example",
    phone: "0241234567",
    orderType: "pickup",
    items: [],
    bundles: [{ id: bundle.id, quantity: 2 }],
    dealCode: "FEATURE5",
  });
  assert.equal(bundleOrderResponse.status, 201);
  const bundleOrder = await bundleOrderResponse.json();
  assert.equal(bundleOrder.subtotal, 50);
  assert.equal(bundleOrder.dealDiscount, 5);
  assert.equal(bundleOrder.total, 45);
  assert.deepEqual(bundleOrder.items, [{
    name: "Feature test bundle",
    quantity: 2,
    unitPrice: 25,
    contents: `4 × ${menuItem.name}`,
  }]);
  const bundleOrderRow = await db.get("SELECT id FROM orders WHERE order_number = ?", [bundleOrder.orderNumber]);
  const bundledIngredients = await db.all(
    "SELECT quantity, bundle_component FROM order_items WHERE order_id = ?",
    [bundleOrderRow.id],
  );
  assert.deepEqual(bundledIngredients, [{ quantity: 4, bundle_component: true }]);
  const bundleTracked = await fetch(`${baseUrl}/api/order-tracking`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: bundleOrder.orderNumber, phone: "0241234567" }),
  });
  assert.equal((await bundleTracked.json()).items[0].contents, `4 × ${menuItem.name}`);
  const bundleStaffOrders = await fetch(`${baseUrl}/api/staff/orders`, { headers: { cookie: managerCookie } });
  assert.ok((await bundleStaffOrders.json()).some((order) =>
    order.orderNumber === bundleOrder.orderNumber &&
    order.items[0].unitPrice === 25 &&
    order.items[0].contents === `4 × ${menuItem.name}`,
  ));

  const firstOrderResponse = await placeOrder({
    customerName: "Feature Customer",
    customerEmail: "features@test.example",
    phone: "0241234567",
    orderType: "pickup",
    items: [{ id: menuItem.id, quantity: 20 }],
  });
  assert.equal(firstOrderResponse.status, 201);
  const firstOrder = await firstOrderResponse.json();
  const firstPayment = await fetch(`${baseUrl}/api/payments/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reference: firstOrder.reference }),
  });
  assert.equal(firstPayment.status, 200);
  const firstOrderRow = await db.get("SELECT id FROM orders WHERE order_number = ?", [firstOrder.orderNumber]);
  const completed = await fetch(`${baseUrl}/api/staff/orders/${firstOrderRow.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ status: "completed" }),
  });
  assert.equal(completed.status, 200);
  const engagement = await fetch(`${baseUrl}/api/customer/engagement`, {
    headers: { cookie: customerCookie },
  });
  assert.equal(engagement.status, 200);
  assert.ok((await engagement.json()).points >= 100);

  const deliveryResponse = await placeOrder({
    customerName: "Feature Customer",
    customerEmail: "features@test.example",
    phone: "0241234567",
    orderType: "delivery",
    deliveryAreaId: area.id,
    deliveryAddress: "12 Example Road, near the main junction",
    dealCode: "FEATURE5",
    useRewards: true,
    items: [{ id: menuItem.id, quantity: 20 }],
  });
  assert.equal(deliveryResponse.status, 201);
  const deliveryOrder = await deliveryResponse.json();
  assert.equal(deliveryOrder.deliveryFee, 3.5);
  assert.equal(deliveryOrder.dealDiscount, 5);
  assert.equal(deliveryOrder.rewardsPointsUsed, 100);
  assert.equal(deliveryOrder.rewardsDiscount, 5);
  assert.equal(Math.round(deliveryOrder.total * 100), subtotalPesewas + 350 - 500 - 500);
  const trackedDelivery = await fetch(`${baseUrl}/api/order-tracking`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: deliveryOrder.orderNumber, phone: "0241234567" }),
  });
  const deliveryData = await trackedDelivery.json();
  assert.equal(deliveryData.deliveryArea, "Feature Test Area");
  assert.equal(deliveryData.deliveryAddress, "12 Example Road, near the main junction");
  assert.equal(deliveryData.rewardsPointsUsed, 100);
  const deliveryRow = await db.get("SELECT id FROM orders WHERE order_number = ?", [deliveryOrder.orderNumber]);
  const kitchenOrders = await fetch(`${baseUrl}/api/staff/orders`, { headers: { cookie: managerCookie } });
  assert.ok((await kitchenOrders.json()).some((order) => order.id === deliveryRow.id && order.deliveryAddress));

  const qrOrderResponse = await placeOrder({
    customerName: "Feature Customer",
    customerEmail: "features@test.example",
    phone: "0241234567",
    orderType: "dine-in",
    tableId: options.tables[0].id,
    items: [{ id: menuItem.id, quantity: 1 }],
  });
  assert.equal(qrOrderResponse.status, 201);
  const qrOrder = await qrOrderResponse.json();
  const qrOrderRow = await db.get("SELECT table_id FROM orders WHERE order_number = ?", [qrOrder.orderNumber]);
  assert.equal(qrOrderRow.table_id, options.tables[0].id);
  const history = await fetch(`${baseUrl}/api/customer/orders`, { headers: { cookie: customerCookie } });
  assert.ok((await history.json()).some((order) => order.orderNumber === qrOrder.orderNumber && order.items[0].menuItemId === menuItem.id));

  const favoriteRemoved = await fetch(`${baseUrl}/api/customer/favorites/${menuItem.id}`, {
    method: "DELETE",
    headers: customerHeaders,
  });
  assert.equal(favoriteRemoved.status, 204);
  const disabledArea = await fetch(`${baseUrl}/api/manager/delivery-areas/${area.id}`, {
    method: "PATCH",
    headers: { ...customerHeaders, cookie: managerCookie },
    body: JSON.stringify({ fee: area.fee, enabled: false }),
  });
  assert.equal(disabledArea.status, 200);
  const refreshedOptions = await (await fetch(`${baseUrl}/api/restaurant-options`)).json();
  assert.ok(!refreshedOptions.deliveryAreas.some((option) => option.id === area.id));
});

test("managers publish staff announcements and staff can mark them as read", async () => {
  const announcementPayload = {
    category: "employee_of_month",
    title: "Employee of the month",
    body: "Congratulations to the kitchen team for excellent service.",
  };
  const anonymousRead = await fetch(`${baseUrl}/api/staff/announcements`);
  assert.equal(anonymousRead.status, 401);
  const invalidAnnouncement = await fetch(`${baseUrl}/api/staff/announcements`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ ...announcementPayload, category: "unknown" }),
  });
  assert.equal(invalidAnnouncement.status, 400);
  const published = await fetch(`${baseUrl}/api/staff/announcements`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify(announcementPayload),
  });
  assert.equal(published.status, 201);
  const announcement = await published.json();
  assert.equal(announcement.category, announcementPayload.category);
  assert.equal(announcement.authorName, "Test Manager");

  const staffPassword = "test-staff-password-123";
  const staffHash = await bcrypt.hash(staffPassword, 4);
  await db.run(
    "INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, 'staff', TRUE)",
    ["Test Staff", "staff-announcements@test.example", staffHash],
  );
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff-announcements@test.example", password: staffPassword }),
  });
  assert.equal(login.status, 200);
  const staffCookie = sessionCookie(login);
  const staffFeed = await fetch(`${baseUrl}/api/staff/announcements`, { headers: { cookie: staffCookie } });
  assert.equal(staffFeed.status, 200);
  const feed = await staffFeed.json();
  const unread = feed.find((entry) => entry.id === announcement.id);
  assert.ok(unread);
  assert.equal(unread.readAt, null);
  const forbiddenPublish = await fetch(`${baseUrl}/api/staff/announcements`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: staffCookie },
    body: JSON.stringify({ category: "promotion", title: "Promotion", body: "Congratulations." }),
  });
  assert.equal(forbiddenPublish.status, 403);
  const markRead = await fetch(`${baseUrl}/api/staff/announcements/${announcement.id}/read`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: staffCookie },
  });
  assert.equal(markRead.status, 200);
  const alreadyRead = await fetch(`${baseUrl}/api/staff/announcements/${announcement.id}/read`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: staffCookie },
  });
  assert.equal(alreadyRead.status, 200);
  const updatedFeed = await (await fetch(`${baseUrl}/api/staff/announcements`, { headers: { cookie: staffCookie } })).json();
  assert.ok(updatedFeed.find((entry) => entry.id === announcement.id).readAt);
});

test("Paystack webhook requires a valid signature and verifies payment before updating an order", async () => {
  const [firstItem] = await (await fetch(`${baseUrl}/api/menu`)).json();
  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Webhook Guest",
      customerEmail: "webhook@example.com",
      phone: "0240000011",
      orderType: "pickup",
      items: [{ id: firstItem.id, quantity: 1 }],
    }),
  });
  const order = await orderResponse.json();
  assert.equal(orderResponse.status, 201);

  const rawBody = JSON.stringify({ event: "charge.success", data: { reference: order.reference } });
  const invalidSignature = await fetch(`${baseUrl}/api/paystack/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": "bad-signature" },
    body: rawBody,
  });
  assert.equal(invalidSignature.status, 401);

  const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const webhook = await fetch(`${baseUrl}/api/paystack/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": signature },
    body: rawBody,
  });
  assert.equal(webhook.status, 200);
  const storedOrder = await db.get("SELECT payment_status, status FROM orders WHERE order_number = ?", [order.orderNumber]);
  assert.equal(storedOrder.payment_status, "paid");
  assert.equal(storedOrder.status, "received");
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
  const storedVerificationToken = await db.get("SELECT token_hash, expires_at FROM email_auth_tokens WHERE purpose = 'verify_email' ORDER BY id DESC LIMIT 1");
  assert.equal(storedVerificationToken.token_hash, createHash("sha256").update(verificationToken).digest("hex"));
  const verificationExpiryMs = Date.parse(storedVerificationToken.expires_at);
  assert.ok(verificationExpiryMs >= Date.now() + 24 * 60 * 60 * 1000 - 5_000);
  assert.ok(verificationExpiryMs <= Date.now() + 24 * 60 * 60 * 1000);
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

  const previousBrevoKey = process.env.BREVO_API_KEY;
  const previousEmailFrom = process.env.EMAIL_FROM;
  const previousAppUrl = process.env.PUBLIC_APP_URL;
  process.env.BREVO_API_KEY = "test-brevo-key";
  process.env.EMAIL_FROM = "orders@example.com";
  process.env.PUBLIC_APP_URL = "https://orderpulse.example.com";
  let resetRequest;
  try {
    resetRequest = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "kojo@example.com" }),
    }).then(async (response) => ({ response, body: await response.json() }));
  } finally {
    restoreEnvironmentValue("BREVO_API_KEY", previousBrevoKey);
    restoreEnvironmentValue("EMAIL_FROM", previousEmailFrom);
    restoreEnvironmentValue("PUBLIC_APP_URL", previousAppUrl);
  }
  assert.equal(resetRequest.response.status, 202);
  assert.match(resetRequest.body.message, /check your spam folder/i);
  assert.equal(brevoMessages.at(-1).to[0].email, "kojo@example.com");
  assert.match(brevoMessages.at(-1).textContent, /resetPassword=/);
  const emailedResetToken = brevoMessages.at(-1).textContent.match(/resetPassword=([a-f0-9]{64})/)?.[1];
  assert.ok(emailedResetToken);
  const unknownResetRequest = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "unknown@example.com" }),
  });
  assert.equal(unknownResetRequest.status, 202);
  assert.equal((await unknownResetRequest.json()).message, resetRequest.body.message);
  const expiredToken = await createEmailAuthToken(registeredUser.id, "reset_password");
  const expiredTokenHash = createHash("sha256").update(expiredToken).digest("hex");
  await db.run("UPDATE email_auth_tokens SET expires_at = ? WHERE token_hash = ?", ["2000-01-01T00:00:00.000Z", expiredTokenHash]);
  const expiredReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: expiredToken, password: "new-guest-account-password-456" }),
  });
  assert.equal(expiredReset.status, 400);
  const resetToken = emailedResetToken;
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

test("a failed verification resend leaves the previously emailed link usable", async () => {
  const previousBrevoKey = process.env.BREVO_API_KEY;
  const previousEmailFrom = process.env.EMAIL_FROM;
  const previousAppUrl = process.env.PUBLIC_APP_URL;
  process.env.BREVO_API_KEY = "test-brevo-key";
  process.env.EMAIL_FROM = "orders@example.com";
  process.env.PUBLIC_APP_URL = "https://orderpulse.example.com";
  brevoResponseStatus = 201;
  try {
    const registered = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Akosua Boateng",
        email: "akosua@example.com",
        phone: "0240000001",
        password: "akosua-account-password-123",
      }),
    });
    assert.equal(registered.status, 201);
    const firstEmail = brevoMessages.at(-1);
    const firstToken = firstEmail.textContent.match(/verifyEmail=([a-f0-9]{64})/)?.[1];
    assert.ok(firstToken);

    brevoResponseStatus = 503;
    const resend = await fetch(`${baseUrl}/api/auth/resend-verification`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "akosua@example.com" }),
    });
    assert.equal(resend.status, 202);
    const firstTokenHash = createHash("sha256").update(firstToken).digest("hex");
    const retainedToken = await db.get(
      "SELECT used_at FROM email_auth_tokens WHERE token_hash = ?",
      [firstTokenHash],
    );
    assert.equal(retainedToken.used_at, null);

    const verified = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: firstToken }),
    });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).email, "akosua@example.com");
  } finally {
    restoreEnvironmentValue("BREVO_API_KEY", previousBrevoKey);
    restoreEnvironmentValue("EMAIL_FROM", previousEmailFrom);
    restoreEnvironmentValue("PUBLIC_APP_URL", previousAppUrl);
    brevoResponseStatus = 201;
  }
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

test("customers can review account history and delete their profile while transaction records are anonymized", async () => {
  const password = "profile-delete-test-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const insertedUser = await db.run(`
    INSERT INTO users (name, email, phone, password_hash, role, email_verified)
    VALUES (?, ?, ?, ?, 'customer', TRUE)
  `, ["History Customer", "profile-history@test.example", "0241234567", passwordHash]);
  const userId = insertedUser.lastInsertRowid;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "profile-history@test.example", password }),
  });
  assert.equal(login.status, 200);
  const cookie = sessionCookie(login);
  const headers = { "content-type": "application/json", cookie };
  const [menuItem] = await db.all("SELECT id FROM menu_items ORDER BY id LIMIT 1");
  const insertedOrder = await db.run(`
    INSERT INTO orders (
      order_number, customer_name, customer_email, phone, order_type, total_pesewas,
      status, payment_status, customer_user_id, delivery_address
    ) VALUES (?, ?, ?, ?, 'delivery', 2599, 'completed', 'paid', ?, ?)
  `, ["GH-ABCDEF1234567890", "History Customer", "profile-history@test.example", "0241234567", userId, "12 Example Road"]);
  for (let index = 1; index <= 30; index += 1) {
    await db.run(`
      INSERT INTO orders (order_number, customer_name, customer_email, phone, order_type, total_pesewas, status, payment_status, customer_user_id)
      VALUES (?, ?, ?, ?, 'pickup', 1000, 'cancelled', 'paid', ?)
    `, [`GH-PROFILE-HISTORY-${index}`, "History Customer", "profile-history@test.example", "0241234567", userId]);
  }
  await db.run(`
    INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_pesewas, quantity)
    VALUES (?, ?, ?, 2599, 1)
  `, [insertedOrder.lastInsertRowid, menuItem.id, "History meal"]);
  await db.run(
    "INSERT INTO order_feedback (order_id, rating, comment_text) VALUES (?, 5, ?)",
    [insertedOrder.lastInsertRowid, "Excellent meal."],
  );
  const insertedBooking = await db.run(`
    INSERT INTO bookings (customer_name, phone, booking_date, booking_time, party_size, notes, customer_user_id, status)
    VALUES (?, ?, '2027-01-20', '19:00', 4, ?, ?, 'requested')
  `, ["History Customer", "0241234567", "Window table", userId]);
  const favorite = await fetch(`${baseUrl}/api/customer/favorites/${menuItem.id}`, {
    method: "POST",
    headers,
  });
  assert.equal(favorite.status, 204);
  await createEmailAuthToken(userId, "reset_password");
  await db.run(`
    INSERT INTO activity_logs (user_id, actor_name, actor_email, action, entity, details)
    VALUES (?, ?, ?, 'test action', 'test entity', ?)
  `, [userId, "History Customer", "profile-history@test.example", "Personal details"]);

  const [ordersResponse, reservationsResponse, feedbackResponse, engagementResponse] = await Promise.all([
    fetch(`${baseUrl}/api/customer/orders`, { headers }),
    fetch(`${baseUrl}/api/customer/reservations`, { headers }),
    fetch(`${baseUrl}/api/customer/feedback`, { headers }),
    fetch(`${baseUrl}/api/customer/engagement`, { headers }),
  ]);
  assert.equal(ordersResponse.status, 200);
  const customerOrderHistory = await ordersResponse.json();
  assert.equal(customerOrderHistory.length, 31);
  assert.ok(customerOrderHistory.find((order) => order.orderNumber === "GH-ABCDEF1234567890").items.some((item) => item.name === "History meal"));
  assert.equal(reservationsResponse.status, 200);
  assert.equal((await reservationsResponse.json())[0].notes, "Window table");
  assert.equal(feedbackResponse.status, 200);
  assert.equal((await feedbackResponse.json())[0].comment, "Excellent meal.");
  assert.equal(engagementResponse.status, 200);
  const engagementHistory = await engagementResponse.json();
  assert.equal(engagementHistory.points, 25);
  assert.equal(engagementHistory.loyaltyHistory[0].type, "earned");
  assert.equal(engagementHistory.loyaltyHistory[0].points, 25);

  const wrongPassword = await fetch(`${baseUrl}/api/customer/account`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ password: "not-the-password" }),
  });
  assert.equal(wrongPassword.status, 401);
  assert.ok(await db.get("SELECT id FROM users WHERE id = ?", [userId]));

  const deleted = await fetch(`${baseUrl}/api/customer/account`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ password }),
  });
  assert.equal(deleted.status, 204);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).status, 401);
  assert.equal(await db.get("SELECT id FROM users WHERE id = ?", [userId]), null);
  assert.equal(await db.get("SELECT token_hash FROM sessions WHERE user_id = ?", [userId]), null);
  assert.equal(await db.get("SELECT id FROM customer_favorites WHERE user_id = ?", [userId]), null);
  assert.equal(await db.get("SELECT id FROM email_auth_tokens WHERE user_id = ?", [userId]), null);

  const retainedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [insertedOrder.lastInsertRowid]);
  assert.equal(retainedOrder.customer_user_id, null);
  assert.equal(retainedOrder.customer_name, "Deleted customer");
  assert.equal(retainedOrder.customer_email, "");
  assert.equal(retainedOrder.phone, "");
  assert.equal(retainedOrder.delivery_address, null);
  const retainedBooking = await db.get("SELECT * FROM bookings WHERE id = ?", [insertedBooking.lastInsertRowid]);
  assert.equal(retainedBooking.customer_user_id, null);
  assert.equal(retainedBooking.customer_name, "Deleted customer");
  assert.equal(retainedBooking.phone, "");
  assert.equal(retainedBooking.notes, "");
  assert.equal(await db.get("SELECT id FROM order_feedback WHERE order_id = ?", [insertedOrder.lastInsertRowid]), null);
  const anonymizedActivity = await db.get("SELECT user_id, actor_name, actor_email, details FROM activity_logs WHERE action = 'test action'");
  assert.equal(anonymizedActivity.user_id, null);
  assert.equal(anonymizedActivity.actor_name, "Deleted account");
  assert.equal(anonymizedActivity.actor_email, "");
  assert.equal(anonymizedActivity.details, "");
});

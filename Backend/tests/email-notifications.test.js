import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  sendCareerApplicationNotifications,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/order-notifications.js";

const environmentKeys = [
  "BREVO_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "GMAIL_USER",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "JOB_APPLICATION_NOTIFICATION_EMAIL",
  "PUBLIC_APP_URL",
];
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

afterEach(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

test("sends verification and password-reset emails through Brevo", async () => {
  process.env.BREVO_API_KEY = "test-brevo-key";
  process.env.EMAIL_FROM = "orders@example.com";
  process.env.PUBLIC_APP_URL = "https://orderpulse.example.com";
  process.env.GMAIL_USER = "";
  process.env.RESEND_API_KEY = "";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ messageId: "email-id" }), { status: 201 });
  };

  const verification = await sendVerificationEmail({
    email: "customer@example.com",
    name: "Ama Mensah",
    token: "verify-token",
  });
  const passwordReset = await sendPasswordResetEmail({
    email: "customer@example.com",
    name: "Ama Mensah",
    token: "reset-token",
  });

  assert.equal(verification.status, "sent");
  assert.equal(passwordReset.status, "sent");
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(request.options.headers["api-key"], "test-brevo-key");
    assert.equal(request.options.headers["Content-Type"], "application/json");
  }
  const verificationPayload = JSON.parse(requests[0].options.body);
  assert.deepEqual(verificationPayload.sender, { name: "OrderPulse", email: "orders@example.com" });
  assert.deepEqual(verificationPayload.to, [{ email: "customer@example.com" }]);
  assert.match(verificationPayload.textContent, /verifyEmail=verify-token/);
  assert.match(verificationPayload.textContent, /expires in 30 seconds/i);
  assert.match(verificationPayload.htmlContent, /expires in 30 seconds/i);
  const resetPayload = JSON.parse(requests[1].options.body);
  assert.match(resetPayload.textContent, /resetPassword=reset-token/);
});

test("sends verification emails through Resend's HTTPS API", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "OrderPulse <orders@example.com>";
  process.env.PUBLIC_APP_URL = "https://orderpulse.example.com";
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
  };

  const result = await sendVerificationEmail({
    email: "customer@example.com",
    name: "Ama Mensah",
    token: "verify-token",
  });
  assert.equal(result.status, "sent");
  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-resend-key");
  const payload = JSON.parse(requestOptions.body);
  assert.equal(payload.from, "OrderPulse <orders@example.com>");
  assert.deepEqual(payload.to, ["customer@example.com"]);
  assert.match(payload.text, /https:\/\/orderpulse\.example\.com\/\?verifyEmail=verify-token/);
});

test("sends verification email through the Gmail API without requiring a custom sender domain", async () => {
  process.env.RESEND_API_KEY = "";
  process.env.EMAIL_FROM = "";
  process.env.GMAIL_USER = "orderpulse.sender@gmail.com";
  process.env.GMAIL_CLIENT_ID = "test-client-id";
  process.env.GMAIL_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";
  process.env.PUBLIC_APP_URL = "https://orderpulse.example.com";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "gmail-message-id" }), { status: 200 });
  };

  const result = await sendVerificationEmail({
    email: "customer@example.com",
    name: "Ama Mensah",
    token: "verify-token",
  });

  assert.equal(result.status, "sent");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(requests[1].url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  const rawEmail = Buffer.from(JSON.parse(requests[1].options.body).raw, "base64url").toString("utf8");
  assert.match(rawEmail, /From: orderpulse\.sender@gmail\.com/);
  assert.match(rawEmail, /To: customer@example\.com/);
  assert.match(rawEmail, /Content-Type: multipart\/alternative/);
  const encodedText = rawEmail.match(
    /Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/,
  )?.[1].replace(/\r\n/g, "");
  assert.ok(encodedText);
  assert.match(Buffer.from(encodedText, "base64").toString("utf8"), /verifyEmail=verify-token/);
});

test("sends applicant CV attachments through Resend as base64 data", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "OrderPulse <orders@example.com>";
  process.env.JOB_APPLICATION_NOTIFICATION_EMAIL = "hiring@example.com";
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
  };

  const result = await sendCareerApplicationNotifications({
    applicationNumber: "APP-123",
    firstName: "Ama",
    lastName: "Mensah",
    email: "ama@example.com",
    phone: "0240000000",
    desiredPosition: "Server",
    message: "Experienced server",
    resumeName: "ama-cv.pdf",
    resumeType: "application/pdf",
    resumeData: Buffer.from("resume contents"),
  });

  assert.equal(result.applicantEmail.status, "sent");
  assert.equal(result.employerEmail.status, "sent");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].reply_to, "ama@example.com");
  assert.deepEqual(requests[1].attachments, [{
    filename: "ama-cv.pdf",
    content_type: "application/pdf",
    content: Buffer.from("resume contents").toString("base64"),
  }]);
});

test("reports Resend delivery failures without returning provider details to users", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "OrderPulse <orders@example.com>";
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "The sender domain is not verified." }),
    { status: 403 },
  );
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args.join(" "));

  const result = await sendVerificationEmail({
    email: "customer@example.com",
    name: "Ama Mensah",
    token: "verify-token",
  });

  assert.equal(result.status, "failed");
  assert.match(result.message, /check the Resend settings/i);
  assert.match(loggedErrors.join(" "), /sender domain is not verified/i);
});

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  sendCareerApplicationNotifications,
  sendVerificationEmail,
} from "../src/order-notifications.js";

const environmentKeys = [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
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

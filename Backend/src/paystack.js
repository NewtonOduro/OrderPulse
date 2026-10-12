import { createHmac, timingSafeEqual } from "node:crypto";

const paystackApi = "https://api.paystack.co";

function getSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("PAYSTACK_NOT_CONFIGURED");
  return secretKey;
}

async function paystackRequest(path, options = {}) {
  const response = await fetch(`${paystackApi}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("PAYSTACK_REQUEST_FAILED");
  }

  if (!response.ok || result.status !== true || !result.data) {
    throw new Error("PAYSTACK_REQUEST_FAILED");
  }

  return result.data;
}

export async function initializePaystackTransaction({
  email,
  amountPesewas,
  reference,
  callbackUrl,
  metadata,
}) {
  const data = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: amountPesewas,
      currency: "GHS",
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  if (typeof data.authorization_url !== "string" || data.reference !== reference) {
    throw new Error("PAYSTACK_INVALID_INITIALIZATION");
  }

  return {
    authorizationUrl: data.authorization_url,
    reference: data.reference,
  };
}

export async function verifyPaystackTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function hasValidPaystackSignature(rawBody, signature) {
  if (typeof rawBody !== "string" || typeof signature !== "string") return false;
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) return false;

  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

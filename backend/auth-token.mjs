import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_SECRET =
  process.env.CHRONICLE_JWT_SECRET ??
  process.env.CHRONICLE_TOKEN_SECRET ??
  "chronicle-dev-secret";
const TOKEN_TTL_SECONDS = Number(process.env.CHRONICLE_TOKEN_TTL_SECONDS ?? 8 * 60 * 60);

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload) {
  const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
  return JSON.parse(json);
}

function sign(encodedPayload) {
  return createHmac("sha256", TOKEN_SECRET).update(encodedPayload).digest("base64url");
}

function safeEquals(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function issueAuthToken(userName) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userName,
    name: userName,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedPayload = encodePayload(payload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload);
  if (!safeEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = decodePayload(encodedPayload);
    if (typeof payload.sub !== "string" || payload.sub.trim() === "") {
      return null;
    }
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      userName: typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name : payload.sub
    };
  } catch {
    return null;
  }
}

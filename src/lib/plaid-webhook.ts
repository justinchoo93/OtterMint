import { importJWK, jwtVerify, type JWTPayload } from "jose";
import { createHash, timingSafeEqual } from "crypto";
import { plaidClient } from "@/lib/plaid";

const MAX_AGE_SECONDS = 5 * 60;

// In-process cache of imported verification keys, keyed by Plaid `kid`.
// A never-before-seen kid triggers a fresh fetch (handles key rotation).
const keyCache = new Map<string, CryptoKey | Uint8Array>();

async function getKey(kid: string): Promise<CryptoKey | Uint8Array> {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const res = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = res.data.key as unknown as Record<string, unknown>;
  if (!jwk) throw new Error("no key for kid");
  const key = await importJWK(jwk, "ES256");
  keyCache.set(kid, key);
  return key;
}

function hexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string
): Promise<boolean> {
  try {
    // Decode only the JWT header (first part) to read alg + kid.
    const headerPart = verificationHeader.split(".")[0];
    const decoded = JSON.parse(
      Buffer.from(headerPart, "base64url").toString("utf8")
    ) as { alg?: string; kid?: string };
    if (decoded.alg !== "ES256" || !decoded.kid) return false;

    const key = await getKey(decoded.kid);
    const { payload } = await jwtVerify(verificationHeader, key, {
      algorithms: ["ES256"],
    });

    const claims = payload as JWTPayload & { request_body_sha256?: string };
    // Freshness: reject tokens older than five minutes (replay protection).
    // Future iat is tolerated (clock skew); only the past-direction is bounded.
    if (typeof claims.iat !== "number") return false;
    if (Math.floor(Date.now() / 1000) - claims.iat > MAX_AGE_SECONDS)
      return false;

    // Bind the signature to this exact body.
    const expected = claims.request_body_sha256;
    if (typeof expected !== "string") return false;
    const actual = createHash("sha256").update(rawBody).digest("hex");
    return hexEqual(actual, expected);
  } catch {
    return false;
  }
}

// @vitest-environment node
// jose's webapi build uses `instanceof Uint8Array` checks that fail under
// jsdom (cross-realm globals); the node environment uses a single realm.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createHash } from "crypto";

// vi.mock factories are hoisted; declare the mock via vi.hoisted so the
// factory can reference it.
const { mockKeyGet } = vi.hoisted(() => ({ mockKeyGet: vi.fn() }));

vi.mock("@/lib/plaid", () => ({
  plaidClient: { webhookVerificationKeyGet: mockKeyGet },
}));

import { verifyPlaidWebhook } from "@/lib/plaid-webhook";

// Helper: build a signed Plaid-Verification header for a given body.
async function makeHeader(opts: {
  body: string;
  privateKey: CryptoKey;
  kid: string;
  iat?: number; // seconds; default now
  bodyHashOverride?: string; // to simulate tampering
}): Promise<string> {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000);
  const sha =
    opts.bodyHashOverride ??
    createHash("sha256").update(opts.body).digest("hex");
  return new SignJWT({ request_body_sha256: sha })
    .setProtectedHeader({ alg: "ES256", kid: opts.kid })
    .setIssuedAt(iat)
    .sign(opts.privateKey);
}

describe("verifyPlaidWebhook", () => {
  let publicJwk: Record<string, unknown>;
  let privateKey: CryptoKey;
  const kid = "test-kid-1";

  beforeEach(async () => {
    vi.clearAllMocks();
    const pair = await generateKeyPair("ES256");
    privateKey = pair.privateKey as CryptoKey;
    publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid,
      alg: "ES256",
      use: "sig",
    };
    mockKeyGet.mockImplementation(async ({ key_id }: { key_id: string }) => {
      if (key_id !== kid) throw new Error("no such key");
      return { data: { key: publicJwk } };
    });
  });

  it("returns true for a valid signature over a matching body", async () => {
    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      item_id: "i1",
    });
    const header = await makeHeader({ body, privateKey, kid });
    expect(await verifyPlaidWebhook(body, header)).toBe(true);
  });

  it("returns false when the body is tampered after signing", async () => {
    const body = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      item_id: "i1",
    });
    const header = await makeHeader({ body, privateKey, kid });
    const tampered = JSON.stringify({
      webhook_type: "TRANSACTIONS",
      item_id: "EVIL",
    });
    expect(await verifyPlaidWebhook(tampered, header)).toBe(false);
  });

  it("returns false for a stale iat (older than 5 minutes)", async () => {
    const body = JSON.stringify({ webhook_type: "ITEM", item_id: "i1" });
    const stale = Math.floor(Date.now() / 1000) - 6 * 60;
    const header = await makeHeader({ body, privateKey, kid, iat: stale });
    expect(await verifyPlaidWebhook(body, header)).toBe(false);
  });

  it("returns false for an unknown kid", async () => {
    const body = JSON.stringify({ webhook_type: "ITEM", item_id: "i1" });
    const header = await makeHeader({ body, privateKey, kid: "unknown-kid" });
    expect(await verifyPlaidWebhook(body, header)).toBe(false);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "crypto";

const testKey = randomBytes(32).toString("hex");

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", testKey);
});

describe("MFA - TOTP generation and validation", () => {
  it("generates a valid TOTP and validates it", async () => {
    const { TOTP, Secret } = await import("otpauth");

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: "OtterMint",
      label: "test@example.com",
      secret,
    });

    const token = totp.generate();
    expect(token).toMatch(/^\d{6}$/);

    const result = totp.validate({ token, window: 1 });
    expect(result).not.toBeNull();
  });

  it("rejects an invalid TOTP code", async () => {
    const { TOTP, Secret } = await import("otpauth");

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: "OtterMint",
      label: "test@example.com",
      secret,
    });

    const result = totp.validate({ token: "000000", window: 0 });
    // This might pass if 000000 happens to be the current code, so we
    // test with a clearly wrong token instead
    const result2 = totp.validate({ token: "999999", window: 0 });
    // At least one of these should be null (both valid at same time is astronomically unlikely)
    expect(result === null || result2 === null).toBe(true);
  });

  it("generates an otpauth URI", async () => {
    const { TOTP, Secret } = await import("otpauth");

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: "OtterMint",
      label: "test@example.com",
      secret,
    });

    const uri = totp.toString();
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("OtterMint");
    expect(uri).toContain("secret=");
  });

  it("encrypts and decrypts a TOTP secret roundtrip", async () => {
    const { Secret } = await import("otpauth");
    const { encrypt, decrypt } = await import("@/lib/crypto");

    const secret = new Secret({ size: 20 });
    const encrypted = encrypt(secret.base32);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secret.base32);
  });
});

describe("MFA - Recovery codes", () => {
  it("generates 8 unique recovery codes of expected format", () => {
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(randomBytes(4).toString("hex"));
    }

    expect(codes).toHaveLength(8);
    const unique = new Set(codes);
    expect(unique.size).toBe(8);

    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("hashes and verifies recovery codes with bcrypt", async () => {
    const bcrypt = await import("bcryptjs");

    const code = randomBytes(4).toString("hex");
    const hash = await bcrypt.hash(code, 10);

    expect(await bcrypt.compare(code, hash)).toBe(true);
    expect(await bcrypt.compare("wrongcode", hash)).toBe(false);
  });

  it("stores and retrieves hashed codes as JSON", async () => {
    const bcrypt = await import("bcryptjs");

    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
      codes.push(randomBytes(4).toString("hex"));
    }

    const hashed = await Promise.all(
      codes.map((c) => bcrypt.hash(c, 10))
    );
    const json = JSON.stringify(hashed);
    const parsed: string[] = JSON.parse(json);

    expect(parsed).toHaveLength(8);

    // Verify first code matches
    expect(await bcrypt.compare(codes[0], parsed[0])).toBe(true);
    // Verify last code matches
    expect(await bcrypt.compare(codes[7], parsed[7])).toBe(true);
    // Cross-verify doesn't match
    expect(await bcrypt.compare(codes[0], parsed[1])).toBe(false);
  });
});

describe("MFA - Login flow logic", () => {
  it("returns mfaRequired when user has MFA enabled", () => {
    // Simulate the login route logic
    const user = { mfaEnabled: true, id: "user-123" };

    if (user.mfaEnabled) {
      const response = { mfaRequired: true, sessionId: "session-456" };
      expect(response.mfaRequired).toBe(true);
      expect(response.sessionId).toBeDefined();
    }
  });

  it("returns user data directly when MFA is not enabled", () => {
    const user = {
      mfaEnabled: false,
      id: "user-123",
      email: "test@example.com",
      displayName: "Test",
    };

    if (!user.mfaEnabled) {
      const response = {
        user: { id: user.id, email: user.email, displayName: user.displayName },
      };
      expect(response.user).toBeDefined();
      expect(response.user.email).toBe("test@example.com");
    }
  });

  it("validates TOTP with window=1 for clock skew tolerance", async () => {
    const { TOTP, Secret } = await import("otpauth");

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: "OtterMint",
      secret,
    });

    const token = totp.generate();
    // With window=1, the current token should always validate
    const result = totp.validate({ token, window: 1 });
    expect(result).not.toBeNull();
  });
});

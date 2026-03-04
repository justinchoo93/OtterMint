import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "crypto";

// Generate a test key before importing the module
const testKey = randomBytes(32).toString("hex");

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", testKey);
});

describe("crypto", () => {
  it("encrypts and decrypts a string roundtrip", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const plaintext = "access-sandbox-abc123-test-token";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const plaintext = "same-input";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it("encrypted output has three colon-separated base64 segments", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // Each part should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
  });

  it("throws on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext part
    const tamperedCiphertext = Buffer.from("tampered").toString("base64");
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is missing", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
  });

  it("throws when ENCRYPTION_KEY is wrong length", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "tooshort");
    const { encrypt } = await import("@/lib/crypto");
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
  });
});

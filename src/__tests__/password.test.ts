import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password helpers", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("mypassword123");
    expect(hash).toBeTruthy();
    expect(hash).not.toBe("mypassword123");
    expect(await verifyPassword("mypassword123", hash)).toBe(true);
  });

  it("rejects incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces different hashes for the same password (unique salt)", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    expect(hash1).not.toBe(hash2);
  });

  it("uses bcrypt format (starts with $2)", async () => {
    const hash = await hashPassword("test");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});

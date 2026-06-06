import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  persistLinkRestore,
  readLinkRestore,
  clearLinkRestore,
  exchangeNewLink,
  LINK_RESTORE_KEY,
} from "@/components/plaid/plaid-restore";

describe("plaid-restore localStorage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a link-mode restore (persist → read)", () => {
    persistLinkRestore("link-token-1", "link");
    expect(readLinkRestore()).toEqual({ token: "link-token-1", mode: "link" });
  });

  it("round-trips an update-mode restore with itemId", () => {
    persistLinkRestore("link-token-2", "update", 42);
    expect(readLinkRestore()).toEqual({
      token: "link-token-2",
      mode: "update",
      itemId: 42,
    });
  });

  it("writes JSON under the plaid_oauth_restore key", () => {
    persistLinkRestore("tok", "link");
    expect(LINK_RESTORE_KEY).toBe("plaid_oauth_restore");
    expect(localStorage.getItem(LINK_RESTORE_KEY)).toBe(
      JSON.stringify({ token: "tok", mode: "link" })
    );
  });

  it("does not write an itemId key for link mode", () => {
    persistLinkRestore("tok", "link", 7);
    expect(readLinkRestore()).toEqual({ token: "tok", mode: "link" });
  });

  it("clears the restore entry", () => {
    persistLinkRestore("tok", "link");
    clearLinkRestore();
    expect(readLinkRestore()).toBeNull();
    expect(localStorage.getItem(LINK_RESTORE_KEY)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(readLinkRestore()).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem(LINK_RESTORE_KEY, "{not valid json");
    expect(readLinkRestore()).toBeNull();
  });

  it("returns null when the stored object is missing required fields", () => {
    localStorage.setItem(LINK_RESTORE_KEY, JSON.stringify({ token: "tok" }));
    expect(readLinkRestore()).toBeNull();
  });

  it("returns null when mode is not a known value", () => {
    localStorage.setItem(
      LINK_RESTORE_KEY,
      JSON.stringify({ token: "tok", mode: "bogus" })
    );
    expect(readLinkRestore()).toBeNull();
  });
});

describe("exchangeNewLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs public_token and institution to the exchange endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const institution = { name: "Test Bank", institution_id: "ins_1" };
    await exchangeNewLink("public-token-xyz", institution);

    expect(fetchMock).toHaveBeenCalledWith("/api/plaid/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_token: "public-token-xyz",
        institution,
      }),
    });
  });

  it("passes a null institution through unchanged", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await exchangeNewLink("public-token-abc", null);

    expect(fetchMock).toHaveBeenCalledWith("/api/plaid/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_token: "public-token-abc",
        institution: null,
      }),
    });
  });
});

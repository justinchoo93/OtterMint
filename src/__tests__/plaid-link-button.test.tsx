import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * Regression test for the "phantom Plaid modal" bug.
 *
 * PlaidLinkButton opens Link with a side effect in its render body:
 *   if (linkToken && ready) open();
 * If `linkToken` is not cleared once Link finishes (success) or is dismissed
 * (exit), the next re-render — e.g. when the parent's onSuccess handler refreshes
 * the account list — calls open() again and a second Plaid modal appears on its
 * own, then freezes the screen. The fix clears linkToken on both onSuccess and
 * onExit. These tests assert open() does not re-fire after either path.
 */

// Capture the options passed to usePlaidLink so the test can invoke the
// onSuccess / onExit callbacks the way the real Plaid Link would.
let lastOptions: {
  token: string | null;
  onSuccess: (publicToken: string, metadata: unknown) => void | Promise<void>;
  onExit?: () => void;
} | null = null;
const openSpy = vi.fn();

vi.mock("react-plaid-link", () => ({
  usePlaidLink: (opts: typeof lastOptions) => {
    lastOptions = opts;
    // The real hook reports ready once a token is present.
    return { open: openSpy, ready: opts!.token != null };
  },
}));

import { PlaidLinkButton } from "@/components/plaid/PlaidLinkButton";

beforeEach(() => {
  lastOptions = null;
  openSpy.mockClear();
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("create-link-token")) {
      return { json: async () => ({ link_token: "test-link-token" }) } as Response;
    }
    // exchange-token
    return { json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
});

async function launchLink() {
  fireEvent.click(screen.getByRole("button"));
  // Token fetch resolves -> linkToken set -> render body calls open().
  await waitFor(() => expect(openSpy).toHaveBeenCalled());
  return openSpy.mock.calls.length; // baseline open count after launch
}

describe("PlaidLinkButton phantom-modal regression", () => {
  it("does not re-open Link after a successful connection + parent re-render", async () => {
    const onSuccess = vi.fn();
    const { rerender } = render(<PlaidLinkButton onSuccess={onSuccess} />);

    const baseline = await launchLink();

    // Plaid reports success; the button exchanges the token then calls onSuccess.
    await act(async () => {
      await lastOptions!.onSuccess("public-token", { institution: null });
    });
    // The parent's onSuccess (e.g. handleRefresh) re-renders the button.
    rerender(<PlaidLinkButton onSuccess={onSuccess} />);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Bug repro: without clearing linkToken, open() fires again here.
    expect(openSpy).toHaveBeenCalledTimes(baseline);
  });

  it("does not re-open Link after the user exits without connecting", async () => {
    const { rerender } = render(<PlaidLinkButton />);

    const baseline = await launchLink();

    // User dismisses the Plaid modal.
    await act(async () => {
      lastOptions!.onExit?.();
    });
    rerender(<PlaidLinkButton />);

    expect(openSpy).toHaveBeenCalledTimes(baseline);
  });
});

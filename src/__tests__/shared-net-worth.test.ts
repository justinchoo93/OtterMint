// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_id: string, fn: (tx: unknown) => unknown) => fn({ select: mocks.select })),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), getClientIp: () => "test" }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
import { GET } from "@/app/api/shared/[token]/route";

it("does not publish reconstructed estimates through a share without quality disclosures", async () => {
  mocks.execute.mockResolvedValue([{ user_id: "owner", label: "test", include_net_worth: true, include_balances: false, include_transactions: false, expires_at: null }]);
  mocks.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ displayName: "Owner" }] }) });
  mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [
    { date: "2026-01-31", totalAssets: "100", totalLiabilities: "0", netWorth: "100", reconstructionNotes: "Private assumptions" },
    { date: "2026-02-28", totalAssets: "110", totalLiabilities: "0", netWorth: "110", reconstructionNotes: null },
  ] }) }) });
  const response = await GET(new NextRequest("http://localhost/api/shared/test"), { params: Promise.resolve({ token: "test" }) });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.snapshots).toEqual([{ date: "2026-02-28", totalAssets: "110", totalLiabilities: "0", netWorth: "110" }]);
  expect(JSON.stringify(body)).not.toContain("Private assumptions");
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUserId,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockSaveCoverageEvent,
  mockDeleteCoverageEvent,
  mockRecomputeUser,
  mockRecomputeGroups,
} = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockSaveCoverageEvent: vi.fn(),
  mockDeleteCoverageEvent: vi.fn(),
  mockRecomputeUser: vi.fn(),
  mockRecomputeGroups: vi.fn(),
}));

const createdRow = {
  id: 42,
  userId: "user-123",
  name: "House",
  type: "asset",
  subtype: "real estate",
  balance: "600000.00",
  isoCurrencyCode: "USD",
  notes: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (tx: unknown) => unknown) =>
    callback({
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      select: vi.fn(),
    })
  ),
}));

vi.mock("@/lib/coverage-events", () => ({
  saveCoverageEvent: mockSaveCoverageEvent,
  deleteCoverageEvent: mockDeleteCoverageEvent,
}));

vi.mock("@/lib/recompute-net-worth", () => ({
  recomputeUserNetWorthSnapshot: mockRecomputeUser,
  recomputeGroupNetWorthSnapshotsForUser: mockRecomputeGroups,
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { NextRequest } from "next/server";
import {
  DELETE,
  POST,
  PUT,
} from "@/app/api/manual-accounts/route";

function request(method: string, body?: unknown, query = "") {
  return new NextRequest(`http://localhost/api/manual-accounts${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  mockInsert.mockReturnValue({
    values: vi.fn(() => ({ returning: vi.fn(async () => [createdRow]) })),
  });
  mockUpdate.mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => [createdRow]) })),
    })),
  });
  mockDelete.mockReturnValue({ where: vi.fn(async () => []) });
  mockSaveCoverageEvent.mockResolvedValue(undefined);
  mockDeleteCoverageEvent.mockResolvedValue(undefined);
  mockRecomputeUser.mockResolvedValue(undefined);
  mockRecomputeGroups.mockResolvedValue(undefined);
});

describe("manual account coverage lifecycle", () => {
  it("captures the addition event and personal snapshot in the create transaction", async () => {
    const response = await POST(
      request("POST", {
        name: "House",
        type: "asset",
        subtype: "real estate",
        balance: "600000.00",
      })
    );

    expect(response.status).toBe(201);
    expect(mockSaveCoverageEvent).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        sourceType: "manual_account",
        sourceId: "42",
        assetAdjustment: "600000.00",
        liabilityAdjustment: "0.00",
      }),
      expect.anything()
    );
    expect(mockRecomputeUser).toHaveBeenCalledWith(
      "user-123",
      expect.anything()
    );
    expect(mockRecomputeGroups).toHaveBeenCalled();
  });

  it("recomputes an edit without changing the first-known event", async () => {
    const response = await PUT(
      request("PUT", {
        id: 42,
        name: "House",
        type: "asset",
        subtype: "real estate",
        balance: "610000.00",
      })
    );

    expect(response.status).toBe(200);
    expect(mockSaveCoverageEvent).not.toHaveBeenCalled();
    expect(mockDeleteCoverageEvent).not.toHaveBeenCalled();
    expect(mockRecomputeUser).toHaveBeenCalled();
  });

  it("removes the retained adjustment before deleting the source", async () => {
    const response = await DELETE(request("DELETE", undefined, "?id=42"));

    expect(response.status).toBe(200);
    expect(mockDeleteCoverageEvent).toHaveBeenCalledWith(
      "user-123",
      "manual_account",
      "42",
      expect.anything()
    );
    expect(mockDeleteCoverageEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockDelete.mock.invocationCallOrder[0]
    );
    expect(mockRecomputeUser).toHaveBeenCalled();
  });
});

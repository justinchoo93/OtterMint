// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUserId,
  mockBuildUserHistory,
  mockBuildGroupHistory,
  mockSelect,
} = vi.hoisted(() => ({
  mockGetUserId: vi.fn(),
  mockBuildUserHistory: vi.fn(),
  mockBuildGroupHistory: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
  isAuthError: () => false,
}));

vi.mock("@/lib/db/with-user", () => ({
  withUser: vi.fn(async (_userId: string, callback: (tx: unknown) => unknown) =>
    callback({ select: mockSelect })
  ),
}));

vi.mock("@/lib/net-worth-history-server", () => ({
  buildUserNetWorthHistory: mockBuildUserHistory,
  buildGroupNetWorthHistory: mockBuildGroupHistory,
}));

vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { NextRequest } from "next/server";
import { GET as getPersonalHistory } from "@/app/api/net-worth/route";
import { GET as getGroupHistory } from "@/app/api/groups/[id]/net-worth/route";

const history = {
  snapshots: [
    {
      date: "2026-07-01",
      totalAssets: "0.00",
      totalLiabilities: "0.00",
      netWorth: "0.00",
      adjustedTotalAssets: "600000.00",
      adjustedTotalLiabilities: "0.00",
      adjustedNetWorth: "600000.00",
      quality: "flat_normalized",
      coverageSegment: 0,
      comparisonSegment: 0,
    },
  ],
  coverageEvents: [],
  periodChange: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserId.mockResolvedValue("user-123");
  mockBuildUserHistory.mockResolvedValue(history);
  mockBuildGroupHistory.mockResolvedValue({
    ...history,
    snapshots: history.snapshots.map((point) => ({
      ...point,
      adjustedTotalAssets: null,
      adjustedTotalLiabilities: null,
      adjustedNetWorth: null,
    })),
  });
  mockSelect.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ userId: "user-123", groupId: "group-1" }]),
    })),
  });
});

describe("coverage-aware net-worth routes", () => {
  it("returns the expanded personal response without renaming raw fields", async () => {
    const response = await getPersonalHistory(
      new NextRequest("http://localhost/api/net-worth?days=30")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snapshots[0]).toMatchObject({
      date: "2026-07-01",
      netWorth: "0.00",
      adjustedNetWorth: "600000.00",
      coverageSegment: 0,
    });
    expect(mockBuildUserHistory).toHaveBeenCalledWith(
      "user-123",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.anything()
    );
  });

  it("keeps the household response aggregate and unadjusted", async () => {
    const response = await getGroupHistory(
      new NextRequest("http://localhost/api/groups/group-1/net-worth?days=30"),
      { params: Promise.resolve({ id: "group-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snapshots[0].netWorth).toBe("0.00");
    expect(body.snapshots[0].adjustedNetWorth).toBeNull();
    expect(mockBuildGroupHistory).toHaveBeenCalledWith(
      "group-1",
      expect.any(String),
      expect.anything()
    );
  });

  it("rejects household history for a non-member before building it", async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn(() => ({ where: vi.fn(async () => []) })),
    });

    const response = await getGroupHistory(
      new NextRequest("http://localhost/api/groups/group-1/net-worth"),
      { params: Promise.resolve({ id: "group-1" }) }
    );

    expect(response.status).toBe(403);
    expect(mockBuildGroupHistory).not.toHaveBeenCalled();
  });
});

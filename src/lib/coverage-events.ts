import { and, eq } from "drizzle-orm";
import { userNetWorthCoverageEvents } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/with-user";
import type { CoverageEventInput, CoverageSourceType } from "@/lib/net-worth-history";

export async function saveCoverageEvent(
  userId: string,
  event: CoverageEventInput,
  executor: DbExecutor
): Promise<void> {
  await executor
    .insert(userNetWorthCoverageEvents)
    .values({ userId, ...event })
    .onConflictDoNothing({
      target: [
        userNetWorthCoverageEvents.userId,
        userNetWorthCoverageEvents.sourceType,
        userNetWorthCoverageEvents.sourceId,
      ],
    });
}

export async function deleteCoverageEvent(
  userId: string,
  sourceType: CoverageSourceType,
  sourceId: string,
  executor: DbExecutor
): Promise<void> {
  await executor
    .delete(userNetWorthCoverageEvents)
    .where(
      and(
        eq(userNetWorthCoverageEvents.userId, userId),
        eq(userNetWorthCoverageEvents.sourceType, sourceType),
        eq(userNetWorthCoverageEvents.sourceId, sourceId)
      )
    );
}

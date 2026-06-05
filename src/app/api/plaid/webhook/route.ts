import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plaidItems, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook";
import { syncTransactions } from "@/lib/sync-transactions";
import { syncHoldings } from "@/lib/sync-holdings";
import { logServerError } from "@/lib/logging";

export async function POST(request: Request): Promise<Response> {
  // Read the raw body exactly once: request.json() would consume the stream
  // and we need the exact bytes to verify the request_body_sha256 claim.
  const rawBody = await request.text();
  const header = request.headers.get("Plaid-Verification");

  if (!header || !(await verifyPlaidWebhook(rawBody, header))) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  let payload: {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
    error?: { error_code?: string; error_message?: string };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const itemId = payload.item_id;
    if (!itemId) return NextResponse.json({ received: true }, { status: 200 });

    const [item] = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.itemId, itemId));
    if (!item) {
      logServerError("Webhook for unknown item", new Error(itemId));
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const accessToken = decrypt(item.accessTokenEncrypted);

    if (
      payload.webhook_type === "TRANSACTIONS" &&
      payload.webhook_code === "SYNC_UPDATES_AVAILABLE"
    ) {
      const result = await syncTransactions(
        accessToken,
        item.transactionsCursor
      );
      await db
        .update(plaidItems)
        .set({
          transactionsCursor: result.nextCursor,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.id, item.id));
    } else if (payload.webhook_type === "ITEM") {
      if (payload.webhook_code === "ERROR") {
        await db
          .update(plaidItems)
          .set({
            errorCode: payload.error?.error_code ?? "ITEM_ERROR",
            errorMessage: payload.error?.error_message ?? "Item error",
            updatedAt: new Date(),
          })
          .where(eq(plaidItems.id, item.id));
      } else if (
        payload.webhook_code === "PENDING_EXPIRATION" ||
        payload.webhook_code === "USER_PERMISSION_REVOKED"
      ) {
        await db
          .update(plaidItems)
          .set({
            errorCode: payload.webhook_code,
            errorMessage:
              payload.webhook_code === "PENDING_EXPIRATION"
                ? "Item access pending expiration; user must re-authenticate"
                : "User revoked access; item must be re-linked",
            updatedAt: new Date(),
          })
          .where(eq(plaidItems.id, item.id));
      }
    } else if (
      payload.webhook_type === "HOLDINGS" &&
      payload.webhook_code === "DEFAULT_UPDATE"
    ) {
      const itemAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.plaidItemId, item.id));
      const investmentIds = itemAccounts
        .filter((a) => a.type === "investment")
        .map((a) => a.accountId);
      if (investmentIds.length > 0) {
        await syncHoldings(accessToken, investmentIds);
      }
    }
    // Any other type/code: acknowledged below as a no-op.
  } catch (err) {
    // Return 200 even on downstream failure so Plaid does not retry-storm;
    // the error is logged for later inspection.
    logServerError("Webhook processing failed", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

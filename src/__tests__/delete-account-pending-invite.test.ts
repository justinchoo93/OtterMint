import { describe, it, expect } from "vitest";
import { groupInvitations } from "@/lib/db/schema";

// Drizzle exposes per-column metadata on the table object. We read the
// "invited_by" column and assert the foreign-key behavior we require so a
// user with a pending sent invitation can delete their account.
describe("group_invitations.invited_by foreign key", () => {
  it("is nullable so a deleted inviter can be set to null", () => {
    const col = groupInvitations.invitedBy;
    expect(col.notNull).toBe(false);
  });

  it("uses ON DELETE SET NULL", () => {
    // Each column carries its inline foreign-key builders. We assert that a
    // foreign key exists for invited_by whose onDelete action is "set null".
    const fks = (groupInvitations as unknown as {
      [Symbol.for("drizzle:PgInlineForeignKeys")]?: Array<{
        onDelete?: string;
        reference: () => { columns: { name: string }[] };
      }>;
    })[Symbol.for("drizzle:PgInlineForeignKeys")];

    expect(fks, "expected inline foreign keys on group_invitations").toBeTruthy();

    const invitedByFk = fks!.find((fk) =>
      fk.reference().columns.some((c) => c.name === "invited_by")
    );

    expect(invitedByFk, "expected a foreign key on invited_by").toBeTruthy();
    expect(invitedByFk!.onDelete).toBe("set null");
  });
});

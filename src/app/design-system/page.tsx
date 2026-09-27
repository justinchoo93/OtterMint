import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignSystemGallery } from "@/components/ui/DesignSystemGallery";

export const metadata: Metadata = { title: "Design system · OtterMint" };

/** Development-only living style guide; see docs/design-system.md. */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignSystemGallery />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentPlayer } from "@/lib/server/profile";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

/** "Profile" in the navigation: your own page, by your username. */
export default function MyProfile() {
  return (
    <Suspense fallback={<div className="mx-auto mt-10 h-64 w-full max-w-3xl animate-pulse rounded-[20px] bg-navy" />}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<never> {
  const player = await currentPlayer();
  if (!player) redirect(`/login?reason=profile&next=${encodeURIComponent("/profile")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/profile")}`);
  redirect(`/profile/${player.username}`);
}

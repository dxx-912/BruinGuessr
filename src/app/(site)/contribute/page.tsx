import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CampusBackdrop } from "@/components/art/CampusScene";
import { currentPlayer } from "@/lib/server/profile";
import { pageMetadata } from "@/lib/site";
import ContributeClient from "./ContributeClient";

export const metadata = pageMetadata({
  title: "Contribute",
  description: "Take a photo on campus with your phone and it can end up in BruinGuessr, credited to you.",
  path: "/contribute",
  index: false,
});

/**
 * Contribute a photo: location, then the rear camera inside the page, then a
 * preview with any faces blurred, then a review queue. Accounts only: a
 * signed-out visitor (guests included) goes to the login page with a line
 * saying why.
 */
export default function ContributePage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <CampusBackdrop />
      <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
        <Contribute />
      </Suspense>
    </section>
  );
}

async function Contribute() {
  const player = await currentPlayer();
  if (!player) redirect(`/login?reason=contribute&next=${encodeURIComponent("/contribute")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/contribute")}`);
  return <ContributeClient username={player.username} />;
}

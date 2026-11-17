import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { currentPlayer } from "@/lib/server/profile";
import { activeRoom } from "@/lib/server/rooms";
import { pageMetadata } from "@/lib/site";
import VersusHome from "./VersusHome";

export const metadata = pageMetadata({
  title: "Versus",
  shareTitle: "Play BruinGuessr versus",
  description: "Race two to five friends on the same five photos from around UCLA's campus, on the same clock. Closest pins win the room.",
  path: "/versus",
});

export default function VersusPage() {
  return (
    <main className="flex flex-1 flex-col bg-night text-paper">
      <SiteHeader>
        <Link href="/leaderboard" className="btn btn-quiet !rounded-full !px-4 !py-1.5 !text-lg">
          Leaderboard
        </Link>
      </SiteHeader>
      <section className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
        <p className="font-semibold text-sky">Two to five players</p>
        <h1 className="display mt-1 text-[clamp(3.6rem,11vw,6.5rem)]">
          Play <span className="text-ucla-gold">versus</span>
        </h1>
        <p className="mt-4 max-w-xl text-xl text-sky">Everyone gets the same five photos and the same 30 seconds. Closest pins win the room.</p>
        <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-[20px] bg-navy" />}>
          <Gate />
        </Suspense>
      </section>
      <SiteFooter />
    </main>
  );
}

async function Gate() {
  // Players must be signed in, with a name the others will see. The room API checks both again.
  const player = await currentPlayer();
  if (!player) redirect(`/?signin=required&next=${encodeURIComponent("/versus")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/versus")}`);
  return <VersusHome rejoinCode={await activeRoom(player.id)} />;
}

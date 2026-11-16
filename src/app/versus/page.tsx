import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Wordmark, { PinMark } from "@/components/Wordmark";
import { currentPlayer } from "@/lib/server/profile";
import { activeRoom } from "@/lib/server/rooms";
import VersusHome from "./VersusHome";

export const metadata: Metadata = { title: "Versus", description: "Race two to five friends on the same five campus photos." };

export default function VersusPage() {
  return (
    <main className="flex flex-1 flex-col bg-night text-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5">
        <Link href="/" className="flex items-center gap-2" aria-label="BruinGuessr home">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </Link>
        <Link href="/leaderboard" className="btn btn-quiet !rounded-full !px-4 !py-1.5 !text-lg">
          Leaderboard
        </Link>
      </header>
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

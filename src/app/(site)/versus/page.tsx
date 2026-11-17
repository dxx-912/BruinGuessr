import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentPlayer } from "@/lib/server/profile";
import { activeRoom } from "@/lib/server/rooms";
import { pageMetadata } from "@/lib/site";
import VersusHome from "./VersusHome";

export const metadata = pageMetadata({
  title: "Versus",
  shareTitle: "Play BruinGuessr versus",
  description: "Two to five friends, the same photos from around UCLA's campus, the same clock. Miss by more than the best pin and you lose health. Last one standing wins.",
  path: "/versus",
});

export default function VersusPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="font-semibold text-sky">Two to five players</p>
        <h1 className="display mt-1 text-[clamp(3.6rem,11vw,6.5rem)]">
          Play <span className="text-ucla-gold">versus</span>
        </h1>
        <p className="mt-4 max-w-xl text-xl text-sky">Everyone starts with full health and sees the same photo. Each round, the best pin is safe and everyone else loses the points they fell short by. Last one standing wins.</p>
        <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-[20px] bg-navy" />}>
          <Gate />
        </Suspense>
    </section>
  );
}

async function Gate() {
  // Players must be signed in, with a name the others will see. The room API checks both again.
  const player = await currentPlayer();
  if (!player) redirect(`/login?reason=versus&next=${encodeURIComponent("/versus")}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent("/versus")}`);
  return <VersusHome rejoinCode={await activeRoom(player.id)} />;
}

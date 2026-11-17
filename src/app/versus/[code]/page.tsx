import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoadingMark from "@/components/LoadingMark";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { currentPlayer } from "@/lib/server/profile";
import { pageMetadata } from "@/lib/site";
import { normalizeRoomCode } from "@/lib/versus/types";
import LobbyClient from "./LobbyClient";

/**
 * What a room link looks like when it is posted in a chat: an invitation. The
 * picture beside it is opengraph-image.tsx in this folder.
 */
export async function generateMetadata({ params }: PageProps<"/versus/[code]">): Promise<Metadata> {
  const code = normalizeRoomCode((await params).code);
  if (!code) return { title: "Room not found", robots: { index: false } };
  return pageMetadata({
    title: `Room ${code}`,
    shareTitle: "Join my BruinGuessr game",
    description: `Room ${code}. Five photos from around UCLA's campus, 30 seconds each, everyone on the same clock. Closest pins win.`,
    path: `/versus/${code}`,
    index: false,
  });
}

export default function RoomPage({ params }: PageProps<"/versus/[code]">) {
  return (
    <Suspense fallback={<main className="grid flex-1 place-items-center bg-night"><LoadingMark label="Finding the room…" /></main>}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const { code: typed } = await params;
  const code = normalizeRoomCode(typed);
  // Not shaped like a room code: the lobby says "Room not found" and offers the way out.
  if (!code) return <LobbyClient key="none" code={null} />;

  const here = `/versus/${code}`;
  const player = await currentPlayer();
  // Someone following a room link signs in (and picks a name) first, then lands back here.
  if (!player) return <Invitation code={code} next={here} />;
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent(here)}`);
  return <LobbyClient key={code} code={code} />;
}

/** A friend's link, opened by someone who is not signed in yet: the room code and one button. */
function Invitation({ code, next }: { code: string; next: string }) {
  return (
    <main className="flex flex-1 flex-col bg-night text-paper">
      <SiteHeader />
      <section className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 pt-8">
        <p className="font-semibold text-sky">You&rsquo;re invited to a versus game</p>
        <h1 className="display mt-1 text-[clamp(3.4rem,13vw,6rem)]">
          Join the <span className="text-ucla-gold">game</span>
        </h1>
        <p aria-label={`Room code ${code.split("").join(" ")}`} className="mt-5 flex gap-2 sm:gap-3">
          {code.split("").map((letter, i) => (
            <span key={i} aria-hidden className="display grid h-20 w-full max-w-24 place-items-center rounded-[14px] border-2 border-navy-line bg-navy text-6xl text-ucla-gold shadow-[0_5px_0_#04101d] sm:h-28 sm:text-8xl">
              {letter}
            </span>
          ))}
        </p>
        <p className="mt-6 max-w-xl text-xl text-sky">
          Everyone gets the same five photos from around UCLA&rsquo;s campus and the same 30 seconds to pin each one on the map. Closest pins win the room.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={`/login?mode=signup&reason=versus&next=${encodeURIComponent(next)}`} className="btn btn-gold !px-6 !py-4 !text-2xl">
            Sign up to join
          </Link>
          <Link href={`/login?reason=versus&next=${encodeURIComponent(next)}`} className="btn btn-blue !px-6 !py-4 !text-2xl">
            Log in
          </Link>
        </div>
        <p className="mt-3 text-sm font-semibold text-sky">Versus needs an account. It&rsquo;s free with Google, and you come straight back to this room.</p>
      </section>
    </main>
  );
}

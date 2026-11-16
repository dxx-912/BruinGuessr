import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentPlayer } from "@/lib/server/profile";
import { normalizeRoomCode } from "@/lib/versus/types";
import LobbyClient from "./LobbyClient";

export const metadata: Metadata = { title: "Versus room", robots: { index: false } };

export default function RoomPage({ params }: PageProps<"/versus/[code]">) {
  return (
    <Suspense fallback={<main className="grid flex-1 place-items-center bg-night"><p className="display animate-pulse text-3xl text-sky">Finding the room…</p></main>}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const { code: typed } = await params;
  const code = normalizeRoomCode(typed);
  // Someone following a room link signs in (and picks a name) first, then lands back here.
  const here = `/versus/${code ?? ""}`;
  const player = await currentPlayer();
  if (!player) redirect(`/?signin=required&next=${encodeURIComponent(here)}`);
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent(here)}`);
  return <LobbyClient key={code ?? "none"} code={code} />;
}

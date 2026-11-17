import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoadingMark from "@/components/LoadingMark";
import { currentGuest } from "@/lib/server/guest";
import { currentPlayer } from "@/lib/server/profile";
import GameClient from "./GameClient";

export const metadata: Metadata = { title: "Game", robots: { index: false } };

export default function GamePage({ params }: PageProps<"/game/[id]">) {
  return (
    <Suspense fallback={<main className="fixed inset-0 grid place-items-center bg-night"><LoadingMark label="Loading your game…" /></main>}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A signed-in player, or a guest playing solo. The game API checks again on every request.
  const player = await currentPlayer();
  if (!player) {
    if (await currentGuest()) return <GameClient key={id} gameId={id} guest />;
    redirect(`/login?next=${encodeURIComponent(`/game/${id}`)}`);
  }
  if (!player.username) redirect(`/welcome?next=${encodeURIComponent(`/game/${id}`)}`);
  return <GameClient key={id} gameId={id} />;
}

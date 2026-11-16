import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/server/auth";
import GameClient from "./GameClient";

export const metadata: Metadata = { title: "Game", robots: { index: false } };

export default function GamePage({ params }: PageProps<"/game/[id]">) {
  return (
    <Suspense fallback={<main className="fixed inset-0 grid place-items-center bg-night"><p className="display animate-pulse text-3xl text-sky">Loading…</p></main>}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Players must be signed in. The game API checks this again on every request.
  if (!(await currentUser())) redirect(`/?signin=required&next=${encodeURIComponent(`/game/${id}`)}`);
  return <GameClient key={id} gameId={id} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNextPath } from "@/lib/server/auth";
import { currentPlayer } from "@/lib/server/profile";
import { suggestUsername } from "@/lib/username";
import UsernameForm from "./UsernameForm";

export const metadata: Metadata = { title: "Pick a username", robots: { index: false } };

export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <section className="mx-auto grid w-full max-w-xl flex-1 content-center px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-72 animate-pulse rounded-[20px] bg-navy" />}>
          <Welcome searchParams={searchParams} />
        </Suspense>
    </section>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/welcome">["searchParams"] }) {
  const [player, query] = await Promise.all([currentPlayer(), searchParams]);
  const next = safeNextPath(typeof query.next === "string" ? query.next : "/");
  if (!player) redirect(`/login?mode=signup&next=${encodeURIComponent("/welcome")}`);
  if (player.username) redirect(next);

  return (
    <div className="panel animate-rise !rounded-[20px] p-6 sm:p-8">
      <p className="font-semibold text-sky">Welcome{player.name ? `, ${player.name.split(/\s+/)[0]}` : ""}.</p>
      <h1 className="display mt-1 text-5xl sm:text-6xl">
        Pick your <span className="text-ucla-gold">name</span>
      </h1>
      <p className="mt-3 text-sky">
        It goes next to your scores on the leaderboard, where everyone can see it. You pick it once, so choose one you like.
      </p>
      <UsernameForm suggestion={suggestUsername(player.name)} next={next} />
    </div>
  );
}

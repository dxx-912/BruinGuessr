"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CampusBackdrop } from "@/components/art/CampusScene";
import Wordmark, { PinMark } from "@/components/Wordmark";

/**
 * Shown when a page fails while it is being put together (for example, the
 * database could not be reached). The game screens handle their own connection
 * problems; this catches everything else.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative isolate flex flex-1 flex-col bg-night text-paper">
      <CampusBackdrop sidebar={false} />
      <header className="mx-auto flex w-full max-w-6xl items-center px-5 pt-5">
        <Link href="/" className="flex items-center gap-2" aria-label="BruinGuessr home">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </Link>
      </header>
      <section className="grid flex-1 place-items-center px-5 py-10">
        <div className="panel w-full max-w-md animate-pop p-7 text-center">
          <p className="font-semibold text-alarm">Something broke on our side</p>
          <h1 className="display mt-1 text-5xl">Could not load this page</h1>
          <p className="mt-3 text-sky">Your games and scores are safe. Try again in a moment.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-gold" onClick={() => retry()}>
              Try again
            </button>
            <Link href="/" className="btn btn-blue">
              Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * The last resort: shown when the layout around every page fails. It replaces
 * the layout, so it brings its own <html> and <body> and uses the fallback
 * typeface rather than the web fonts.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · BruinGuessr</title>
        <main className="grid flex-1 place-items-center bg-night px-5 py-10 text-paper">
          <div className="panel w-full max-w-md p-7 text-center">
            <p className="display text-3xl">
              Bruin<span className="text-ucla-gold">Guessr</span>
            </p>
            <h1 className="display mt-4 text-5xl">Something went wrong</h1>
            <p className="mt-3 text-sky">The site hit a problem it could not recover from. Your games and scores are safe.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" className="btn btn-gold" onClick={() => retry()}>
                Try again
              </button>
              {/* A full page load on purpose: the app itself is what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn btn-blue">
                Home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}

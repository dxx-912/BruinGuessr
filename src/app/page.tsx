import Link from "next/link";

// Placeholder home page. The real one (Solo and Versus tiles, top players) is built in Phase 2 and 3.
export default function Home() {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-ink px-6 py-16 text-center text-white">
      <p className="text-sm font-semibold uppercase tracking-widest text-ucla-gold">Coming soon</p>
      <h1 className="mt-3 text-5xl font-black italic tracking-tight sm:text-7xl">
        Bruin<span className="text-ucla-gold">Guessr</span>
      </h1>
      <p className="mt-4 max-w-md text-lg text-white/80">
        See a photo from somewhere on UCLA&apos;s campus. Drop a pin. The closer you land, the more you score.
      </p>
      {isDev && (
        <Link
          href="/dev/boundary"
          className="mt-8 rounded-full bg-ucla-gold px-6 py-3 text-sm font-bold text-ink shadow-[0_4px_0_#b89600] transition active:translate-y-0.5 active:shadow-[0_2px_0_#b89600]"
        >
          Review the campus boundary (dev only)
        </Link>
      )}
    </main>
  );
}

import Link from "next/link";

/** The small print under every page that is not the game itself. */
export default function SiteFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-sm text-sky">
      <p>
        BruinGuessr is a student project. It is not affiliated with or endorsed by UCLA. Photos by Mapillary and Wikimedia Commons contributors. Map data ©
        OpenStreetMap contributors, map tiles by OpenFreeMap.
      </p>
      <nav aria-label="More pages" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-semibold">
        <Link href="/" className="underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Home
        </Link>
        <Link href="/leaderboard" className="underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Leaderboard
        </Link>
        <Link href="/credits" className="underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Photo and map credits
        </Link>
      </nav>
      {children}
    </footer>
  );
}

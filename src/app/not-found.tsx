import type { Metadata } from "next";
import Link from "next/link";
import { CampusBackdrop } from "@/components/art/CampusScene";
import SiteHeader from "@/components/SiteHeader";
import { campusSvgPath, campusSvgPoint } from "@/lib/map/campus";

export const metadata: Metadata = { title: "Page not found" };

const W = 520;
const H = 440;
const PAD = 70;

/** A guess that missed the campus altogether: the pin sits outside the outline, with no answer to draw a line to. */
function OffTheMap({ className = "" }: { className?: string }) {
  const outline = campusSvgPath(W, H, PAD);
  // South-west of the boundary, in Westwood: nowhere the game goes.
  const [px, py] = campusSvgPoint(-118.4525, 34.0628, W, H, PAD);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="The campus outline, with a pin dropped well outside it">
      <path d={outline} fill="#0B2742" stroke="#1C4467" strokeWidth="12" strokeLinejoin="round" />
      <path d={outline} fill="#0E3154" stroke="#2774AE" strokeWidth="3.500" strokeLinejoin="round" />
      <ellipse cx={px} cy={py + 2} rx="16" ry="5" fill="#020A14" opacity="0.7" />
      <g transform={`translate(${px - 21} ${py - 53})`}>
        <g className="animate-drop [animation-delay:250ms]">
          <path d="M21 3C10.500 3 2 11.300 2 21.500 2 35 21 53 21 53s19-18 19-31.500C40 11.300 31.500 3 21 3z" fill="#2774AE" stroke="#F4F8FC" strokeWidth="4" />
          <text x="21" y="29" textAnchor="middle" fontFamily="var(--font-display)" fontStyle="italic" fontWeight="800" fontSize="22" fill="#F4F8FC">
            ?
          </text>
        </g>
      </g>
    </svg>
  );
}

/**
 * The 404 page, told in the game's own terms: a pin that landed off the map
 * scores nothing. Shown for any address the site does not have.
 */
export default function NotFound() {
  return (
    <main className="relative isolate flex flex-1 flex-col bg-night text-paper">
      <CampusBackdrop sidebar={false} />
      <SiteHeader />
      <section className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-6 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:py-14">
        <div>
          <p className="font-semibold text-sky">Error 404 · Way off</p>
          <h1 className="display mt-1 text-[clamp(3.6rem,13vw,7rem)]">
            Off the <span className="text-ucla-gold">map</span>
          </h1>
          <p className="mt-4 max-w-md text-xl text-sky">This page is not anywhere on campus. The link may be mistyped, or the page may have moved.</p>

          {/* The reveal panel's score line, for a guess that could not have scored. */}
          <div className="panel mt-7 max-w-md p-4">
            <p className="display flex items-baseline gap-2 text-5xl text-out">
              <span className="numeric">0</span>
              <span className="text-2xl text-paper">points</span>
            </p>
            <div className="mt-2 h-3 rounded-full bg-night" role="img" aria-label="0 of 5,000 points" />
            <p className="mt-2 font-semibold">No photo was taken here.</p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-gold !px-7 !py-3.5 !text-2xl">
              Back to the game
            </Link>
            <Link href="/leaderboard" className="btn btn-blue !py-3.5 !text-2xl">
              Leaderboard
            </Link>
          </div>
        </div>
        <OffTheMap className="mx-auto w-full max-w-sm md:max-w-none" />
      </section>
    </main>
  );
}

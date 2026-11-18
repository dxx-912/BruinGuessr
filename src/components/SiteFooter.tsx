import Link from "next/link";

/**
 * One quiet, centred line under every page that is not the game itself. The
 * development links exist only under `next dev`: Next.js replaces
 * `process.env.NODE_ENV` with "production" in a build, so the branch is
 * removed from the production bundle (checked against `npm run build`).
 */
export default function SiteFooter() {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <footer className="px-4 pb-5 pt-10 text-center text-xs text-sky sm:px-6">
      <p>
        A student project, not affiliated with UCLA.{" "}
        <Link href="/credits" className="font-semibold underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Photo and map credits
        </Link>
        {" · Built by "}
        <a href="https://www.linkedin.com/in/dxing01/" target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Daniel Xing
        </a>
        {" · "}
        <Link href="/privacy" className="font-semibold underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="font-semibold underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Terms
        </Link>
        {isDev && (
          <>
            {" · Development: "}
            <Link href="/dev/boundary" className="underline">
              boundary
            </Link>
            {", "}
            <Link href="/dev/photos" className="underline">
              photos
            </Link>
            {", "}
            <a href="/api/dev/login?as=1" className="underline">
              test player 1
            </a>
          </>
        )}
      </p>
    </footer>
  );
}

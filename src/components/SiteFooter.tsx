import Link from "next/link";

/** One quiet line under every page that is not the game itself. */
export default function SiteFooter() {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <footer className="px-4 pb-4 pt-8 text-xs text-sky sm:px-6">
      <p>
        A student project, not affiliated with UCLA.{" "}
        <Link href="/credits" className="font-semibold underline decoration-navy-line decoration-2 underline-offset-4 hover:text-paper">
          Photo and map credits
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

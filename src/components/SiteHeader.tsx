import Link from "next/link";
import Wordmark, { PinMark } from "./Wordmark";

/** The top of a plain page: the mark as the way home, and whatever the page adds on the right. */
export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-5">
      <Link href="/" className="flex items-center gap-2" aria-label="BruinGuessr home">
        <PinMark className="h-8 w-auto" />
        <Wordmark className="text-3xl" />
      </Link>
      {children}
    </header>
  );
}

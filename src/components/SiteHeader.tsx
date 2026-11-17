import Link from "next/link";
import { Suspense } from "react";
import AccountArea, { AccountAreaPlaceholder } from "./shell/AccountArea";
import Wordmark, { PinMark } from "./Wordmark";

/**
 * The top of a page outside the main layout (a room invitation, "Off the map"):
 * the mark as the way home, and the account corner on the right.
 */
export default function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <Link href="/" className="flex items-center gap-2" aria-label="BruinGuessr home">
        <PinMark className="h-8 w-auto" />
        <span className="hidden min-[400px]:inline">
          <Wordmark className="text-3xl" />
        </span>
      </Link>
      <Suspense fallback={<AccountAreaPlaceholder />}>
        <AccountArea />
      </Suspense>
    </header>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import AccountArea, { AccountAreaPlaceholder } from "@/components/shell/AccountArea";
import NavLinks, { NavList } from "@/components/shell/NavLinks";
import SiteFooter from "@/components/SiteFooter";
import Wordmark, { PinMark } from "@/components/Wordmark";

/**
 * Every page except the game itself and a versus lobby: the side bar (laptop
 * and wider), or the bottom tab bar (phones and tablets), plus the account
 * corner at top right. The side bar starts at 1024 px, wider than any phone
 * held sideways, so a phone always gets the tab bar.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 bg-night text-paper">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r-2 border-navy-line bg-navy px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 flex items-center gap-2 px-2" aria-label="BruinGuessr home">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </Link>
        <nav aria-label="Main">
          <Suspense fallback={<NavList variant="side" path={null} />}>
            <NavLinks variant="side" />
          </Suspense>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:justify-end">
          <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="BruinGuessr home">
            <PinMark className="h-8 w-auto" />
            <span className="hidden min-[400px]:inline">
              <Wordmark className="text-3xl" />
            </span>
          </Link>
          <Suspense fallback={<AccountAreaPlaceholder />}>
            <AccountArea />
          </Suspense>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
        {/* Room for the tab bar, so the footer is never under it. */}
        <div aria-hidden className="h-[calc(3.5rem+2px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-navy-line bg-navy pb-[env(safe-area-inset-bottom)] lg:hidden">
        <Suspense fallback={<NavList variant="tabs" path={null} />}>
          <NavLinks variant="tabs" />
        </Suspense>
      </nav>
    </div>
  );
}

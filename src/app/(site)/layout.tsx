import Link from "next/link";
import { Suspense } from "react";
import JoinCodeForm from "@/components/JoinCodeForm";
import { ROOM_CODE_LENGTH } from "@/lib/versus/types";
import AccountArea,{ AccountAreaPlaceholder } from "@/components/shell/AccountArea";
import NavLinks, { NavList } from "@/components/shell/NavLinks";
import SidebarStanding, { SidebarStandingPlaceholder } from "@/components/shell/SidebarStanding";
import SiteFooter from "@/components/SiteFooter";
import Wordmark, { PinMark } from "@/components/Wordmark";

/**
 * Every page except the game itself and a versus lobby. `isolate` makes this
 * the stacking context that the campus backdrop (on most pages) sits in:
 * above the night background, under everything else. The rest: the side bar (laptop
 * and wider, with the player's best score and rank, or a Sign up card, at
 * its foot), or the bottom tab bar (phones and tablets), plus the account
 * corner at top right. The side bar starts at 1024 px, wider than any phone
 * held sideways, so a phone always gets the tab bar.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="isolate flex flex-1 bg-night text-paper">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r-2 border-navy-line bg-[radial-gradient(120%_40%_at_0%_0%,rgb(39_116_174/0.22),transparent_70%),linear-gradient(180deg,#0e2e4f_0%,#0b2742_45%,#071d33_100%)] px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 flex items-center gap-2 px-2" aria-label="BruinGuessr home">
          <PinMark className="h-8 w-auto" />
          <Wordmark className="text-3xl" />
        </Link>
        <nav aria-label="Main">
          <Suspense fallback={<NavList variant="side" path={null} />}>
            <NavLinks variant="side" />
          </Suspense>
        </nav>
        {/* The empty middle of the bar: a room code goes straight to the room. */}
        <div className="flex flex-1 items-center py-6">
          <div className="w-full rounded-[18px] border border-white/10 bg-night/45 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
            <JoinCodeForm variant="side" label="Join with a code" />
            <p className="mt-2 text-sm text-sky">The {ROOM_CODE_LENGTH} letters a friend sent you.</p>
          </div>
        </div>
        <div>
          <Suspense fallback={<SidebarStandingPlaceholder />}>
            <SidebarStanding />
          </Suspense>
        </div>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

type Item = { href: string; label: string; icon: React.ReactNode; match: (path: string) => boolean };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Play",
    match: (p) => p === "/" || p.startsWith("/versus"),
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.8" r="2.3" />
      </svg>
    ),
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    match: (p) => p.startsWith("/leaderboard"),
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    match: (p) => p.startsWith("/profile"),
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <circle cx="12" cy="8.5" r="3.8" />
        <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    match: (p) => p.startsWith("/settings"),
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" />
        <circle cx="9" cy="17" r="2.2" />
      </svg>
    ),
  },
];

/**
 * The four destinations. On a wide screen they stand in the side bar; on a
 * phone (and anything narrower than a laptop) they are the bottom tab bar.
 */
export default function NavLinks({ variant }: { variant: "side" | "tabs" }) {
  const path = usePathname();
  // With a Proxy in front, the pathname a prerendered page was made with can differ from the
  // browser's, and React keeps the server's attributes when it hydrates, so on a fresh load the
  // Play item was not lit in production. Hydrate with nothing marked, then mark the browser's
  // pathname: that second render really updates the DOM. (Next.js docs, usePathname, "Avoid
  // hydration mismatch with rewrites".)
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return <NavList variant={variant} path={hydrated ? path : null} />;
}

const noop = () => () => {};

/**
 * The links themselves. With no path (while the page streams in), none is marked as current.
 * Quiet by design: Barlow in sentence case, sky blue. The current page is lit: paper text, a gold
 * icon and a gold marker (a bar on the side bar's edge, a line over the tab).
 */
export function NavList({ variant, path }: { variant: "side" | "tabs"; path: string | null }) {
  if (variant === "tabs") {
    return (
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = path !== null && item.match(path);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                  active ? "text-paper" : "text-sky/75 hover:text-paper"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-ucla-gold" />}
                <span className={`h-[22px] w-[22px] ${active ? "text-ucla-gold" : ""}`}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-1">
      {ITEMS.map((item) => {
        const active = path !== null && item.match(path);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-[1.05rem] font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-paper ${
                active
                  ? "border-ucla-blue/30 bg-ucla-blue/20 text-paper"
                  : "border-transparent text-sky hover:border-white/8 hover:bg-white/[0.06] hover:text-paper"
              }`}
            >
              {/* The gold bar on the side bar's edge: lit for the current page, a faint preview on hover. */}
              <span
                aria-hidden
                className={`absolute -left-3 top-2 bottom-2 w-1 rounded-r-full transition-opacity duration-150 ${
                  active ? "bg-ucla-gold" : "bg-sky/50 opacity-0 group-hover:opacity-100"
                }`}
              />
              <span
                className={`h-5 w-5 shrink-0 transition-transform duration-150 ${active ? "text-ucla-gold" : "group-hover:translate-x-0.5"}`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

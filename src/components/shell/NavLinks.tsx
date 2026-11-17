"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  return <NavList variant={variant} path={usePathname()} />;
}

/** The links themselves. With no path (while the page streams in), none is marked as current. */
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
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? "text-ucla-gold" : "text-sky hover:text-paper"}`}
              >
                <span className="h-6 w-6">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5">
      {ITEMS.map((item) => {
        const active = path !== null && item.match(path);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`display flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-2xl ${
                active ? "bg-ucla-gold text-night" : "text-paper hover:bg-navy-line"
              }`}
            >
              <span className="h-6 w-6 shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
